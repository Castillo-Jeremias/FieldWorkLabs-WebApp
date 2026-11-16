import copy
import json
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pandas as pd
from pydantic import ValidationError
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

from api import SimInput, app, simulate, water_risk
from geospatial import area_ha, validate_polygon
from riesgo_hidrico import build_water_risk
from train_xgboost_anegamiento import category, train_and_predict_waterlogging, validate_grid


def simulation_fixture():
    def sample(day, depth):
        return {"fecha": f"2024-01-{day}", "cultivo": "Soja", "napa_acoplada_nivel_3_m": depth,
                "napa_natural_nivel_1_2_m": depth, "humedad_0_100cm_asimilada_m3m3": 0.32,
                "capas_suelo_m3m3": dict.fromkeys(["th1_0_20cm", "th2_20_50cm", "th3_50_100cm", "th4_100_200cm"], 0.3)}
    return {"ubicacion": {"lat": -33.04, "lon": -61.16, "fuente_nasa": "fixture_sintetico"},
            "escenario_evaluado": {"origen_napa_3_niveles": "fixture_sintetico"},
            "comparativa_rotaciones": {"rot_1_actual": {"nombre": "Soja",
                "serie_temporal_fao_nasa": [sample("15", 1.5), sample("20", 1.0)],
                "campanas_simuladas": [{"cultivo": "Soja", "fecha_inicio": "2024/01/01", "fecha_fin": "2024/01/31",
                    "balance_hidrico_mm": {"lluvia_ciclo_mm": 100, "et0_demanda_mm": 80,
                        "transpiracion_real_tr_mm": 50, "evaporacion_suelo_es_mm": 10,
                        "ascenso_capilar_napa_cr_mm": 20, "percolacion_profunda_dp_mm": 5},
                    "estres_fao_dias": {"dias_estres_sequia_sto": 3, "dias_estres_anegamiento_aer": 2}}]}}}


class WaterRiskTests(unittest.TestCase):
    def setUp(self):
        self.simulation = simulation_fixture()
        self.weather = pd.DataFrame({"Date": pd.date_range("2024-01-01", periods=20), "Precipitation": 2.0})

    def test_balances_trend_and_scenario_use_actual_inputs(self):
        with patch("riesgo_hidrico.train_and_predict_waterlogging", return_value={"rot_1_actual": {"estado": "test"}}) as model:
            result = build_water_risk(self.simulation, self.weather)["por_rotacion"]["rot_1_actual"]
        scenario = model.call_args.args[0]["rot_1_actual"]
        self.assertEqual(scenario["lluvia_15d_mm"], 30)
        self.assertEqual(scenario["napa_m"], 1.0)
        self.assertEqual(scenario["humedad_m3m3"], 0.32)
        self.assertEqual(result["napa"]["tendencia"]["direccion"], "subiendo_hacia_superficie")
        self.assertEqual(result["napa"]["tendencia"]["cambio_cm_semana"], -70)
        self.assertEqual(result["balance_campanas"]["consumo_total_et_mm"], 60)
        self.assertEqual(result["balance_campanas"]["hasta"], "2024-01-31")
        self.assertEqual(result["fecha_evaluacion"], "2024-01-20")
        self.assertEqual(result["estres_campanas"]["dias_sequia"], 3)

    def test_missing_weather_is_not_zero_rainfall(self):
        with patch("riesgo_hidrico.train_and_predict_waterlogging", return_value={"rot_1_actual": {"estado": "sin_datos"}}) as model:
            result = build_water_risk(self.simulation, self.weather.iloc[:-1])["por_rotacion"]["rot_1_actual"]
        self.assertIsNone(model.call_args.args[0]["rot_1_actual"])
        self.assertIsNone(result["lluvia_ultimos_15_dias_mm"])

    def test_date_uses_previous_available_sample_and_rejects_today(self):
        with patch("riesgo_hidrico.train_and_predict_waterlogging", return_value={"rot_1_actual": {"estado": "test"}}):
            result = build_water_risk(self.simulation, self.weather, fecha_evaluacion="2024-01-18")["por_rotacion"]["rot_1_actual"]
        self.assertEqual(result["fecha_evaluacion"], "2024-01-15")
        self.assertIsNone(result["napa"]["tendencia"]["cambio_cm_semana"])
        with self.assertRaises(ValueError):
            build_water_risk(self.simulation, self.weather, fecha_evaluacion="2030-01-01")

    def test_api_validates_values_and_geometry(self):
        for bad in ({"lat": 999}, {"napa_m": -1}, {"escenario_clima": "otro"},
                    {"historial_rinde_soja_tn_ha": [-1]}, {"lat": float("nan")},
                    {"poligono_lote": mapping(box(0, 0, 1, 1))}):
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                SimInput(**bad)
        with self.assertRaises(ValueError):
            validate_polygon({"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]})

    def test_routes_serialize_and_do_not_write_shared_output(self):
        model_result = {"riesgo_hidrico": {"schema_version": "1.0", "por_rotacion": {}}, "modelo": "test"}
        model = Mock(side_effect=lambda **kw: copy.deepcopy(model_result))
        with patch.dict(sys.modules, {"run_aquacrop": SimpleNamespace(run_aquacrop_rotations=model)}):
            risk = water_risk(SimInput(lat=-33.04, lon=-61.16))
            self.assertEqual(risk["schema_version"], "1.0")
            self.assertIn("ejecucion_id", risk)
            self.assertIsNone(model.call_args.kwargs["output_json"])
            full = simulate(SimInput())
            self.assertIn("riesgo_hidrico", full)
            self.assertNotEqual(risk["ejecucion_id"], full["ejecucion_id"])
        json.dumps(full, allow_nan=False)
        self.assertIn('/api/v1/riesgo-hidrico', app.openapi()['paths'])


class SpatialRiskTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lot = box(-61.164, -33.044, -61.158, -33.038)
        cls.scenarios = {"seco": {"fecha": "2024-01-20", "lluvia_15d_mm": 10, "napa_m": 3.0, "humedad_m3m3": 0.2},
                         "humedo": {"fecha": "2024-01-20", "lluvia_15d_mm": 180, "napa_m": 0.8, "humedad_m3m3": 0.44}}
        cls.layers = train_and_predict_waterlogging(cls.scenarios, lat=-33.04, lon=-61.16, poligono_lote=mapping(cls.lot))

    def test_runtime_scenarios_change_predictions(self):
        dry = self.layers["seco"]["resumen"]["probabilidad_media_anegamiento_pct"]
        wet = self.layers["humedo"]["resumen"]["probabilidad_media_anegamiento_pct"]
        self.assertGreater(wet, dry)
        self.assertTrue(self.layers["humedo"]["calculado_en_ejecucion"])
        metrics = self.layers["humedo"]["metrics_test"]
        self.assertLess(metrics["entrenamiento_hasta"], metrics["evento_test"])

    def test_clipping_probabilities_and_area_summary(self):
        result = self.layers["humedo"]
        cells = [shape(f["geometry"]) for f in result["geojson"]["features"]]
        self.assertLess(unary_union(cells).symmetric_difference(self.lot).area, 1e-12)
        weighted, high_area, total = 0, 0, 0
        for feature, cell in zip(result["geojson"]["features"], cells):
            p = feature["properties"]
            self.assertTrue(self.lot.covers(cell))
            self.assertTrue(0 <= p["probabilidad_anegamiento_pct"] <= 100)
            self.assertEqual(cell.exterior.coords[0], cell.exterior.coords[-1])
            a = area_ha(cell)
            total += a
            weighted += a * p["probabilidad_anegamiento_pct"]
            if p["categoria_riesgo"] == "Alto": high_area += a
        self.assertAlmostEqual(result["resumen"]["probabilidad_media_anegamiento_pct"], weighted / total, delta=0.02)
        self.assertAlmostEqual(result["resumen"]["superficie_riesgo_alto_pct"], high_area / total * 100, delta=0.02)
        self.assertAlmostEqual(result["resumen"]["cobertura_lote_pct"], 100, delta=0.01)
        json.dumps(result, allow_nan=False)

    def test_outside_coverage_is_unavailable_not_zero(self):
        result = train_and_predict_waterlogging(self.scenarios, lat=42.03, lon=-93.62)
        self.assertEqual(result["seco"]["estado"], "sin_datos")
        self.assertIsNone(result["seco"]["resumen"])
        self.assertEqual(result["seco"]["geojson"]["features"], [])

    def test_holes_and_custom_grid_validation(self):
        hole = box(-61.163, -33.043, -61.162, -33.042)
        lot = self.lot.difference(hole)
        feature = {"type": "Feature", "id": "zona", "geometry": mapping(lot),
                   "properties": {"elev_srtm_m": 77, "slope_pct": 1, "twi": 12, "clay_pct": 30}}
        collection = {"type": "FeatureCollection", "features": [feature]}
        validate_grid(collection)
        result = train_and_predict_waterlogging({"seco": self.scenarios["seco"]}, lat=-33.04, lon=-61.16,
                                               poligono_lote=mapping(lot), grilla_anegamiento=collection)["seco"]
        geom = shape(result["geojson"]["features"][0]["geometry"])
        self.assertEqual(len(geom.interiors), 1)
        self.assertLess(geom.intersection(hole).area, 1e-12)
        with self.assertRaises(ValueError):
            validate_grid({"type": "FeatureCollection", "features": [feature, {**feature, "id": "duplicada"}]})

    def test_category_boundaries(self):
        self.assertEqual([category(p) for p in [0, 30, 30.01, 65, 65.01, 100]], ["Bajo", "Bajo", "Medio", "Medio", "Alto", "Alto"])


if __name__ == "__main__":
    unittest.main()
