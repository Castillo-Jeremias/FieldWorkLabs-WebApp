"""Entrena y predice anegamiento en la misma ejecución; exporta celdas GeoJSON.

La grilla incluida es una demo de Casilda sin validación de campo acreditada.
Las probabilidades son salidas del clasificador, no probabilidades calibradas.
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from shapely.geometry import Point
from shapely.ops import unary_union
from sklearn.metrics import f1_score, roc_auc_score
import xgboost as xgb

from geospatial import (area_ha, cells_from_centers, clip_cells, geojson_geometry,
                        validate_polygon)

ROOT = Path(__file__).resolve().parent
DEFAULT_CSV = ROOT / "data/grilla_espacial_anegamiento_srtm_sentinel.csv"
FEATURES = ["elev_srtm_m", "slope_pct", "twi", "clay_pct", "rain_15d_mm", "napa_local_m", "smap_rootzone_sm"]
TOPOGRAPHY = FEATURES[:4]


def category(probability_pct):
    return "Bajo" if probability_pct <= 30 else "Medio" if probability_pct <= 65 else "Alto"


def empty_layer(reason):
    return {"estado": "sin_datos", "motivo": reason, "resumen": None,
            "geojson": {"type": "FeatureCollection", "features": []}}


def _custom_grid(collection):
    if not isinstance(collection, dict) or collection.get("type") != "FeatureCollection":
        raise ValueError("grilla_anegamiento debe ser una FeatureCollection de celdas con relieve y suelo")
    features = collection.get("features", [])
    if not isinstance(features, list) or not 1 <= len(features) <= 2500:
        raise ValueError("La grilla debe contener entre 1 y 2500 celdas")
    rows, cells, ids = [], [], set()
    for i, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise ValueError("Cada celda debe ser un GeoJSON Feature")
        geom = validate_polygon(feature.get("geometry"))
        props = feature.get("properties") or {}
        try:
            values = {key: float(props[key]) for key in TOPOGRAPHY}
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Cada celda necesita elev_srtm_m, slope_pct, twi y clay_pct numéricos") from exc
        if not all(math.isfinite(v) for v in values.values()) or not (0 <= values["slope_pct"] <= 100 and 0 <= values["clay_pct"] <= 100):
            raise ValueError("Predictores de las celdas fuera de rango")
        cell_id = str(feature.get("id", f"celda_{i:04d}"))
        if cell_id in ids:
            raise ValueError("Los identificadores de celdas deben ser únicos")
        ids.add(cell_id)
        center = geom.representative_point()
        rows.append({"pixel_id": cell_id, "lat": center.y, "lon": center.x, **values})
        cells.append(geom)
    total_area = sum(area_ha(c) for c in cells)
    if total_area - area_ha(unary_union(cells)) > max(0.001, total_area * 0.0001):
        raise ValueError("Las celdas de la grilla no deben solaparse")
    validate_polygon(geojson_geometry(unary_union(cells)))
    return pd.DataFrame(rows), cells


def validate_grid(collection):
    _custom_grid(collection)
    return collection


def train_and_predict_waterlogging(scenarios, *, lat, lon, poligono_lote=None,
                                  grilla_anegamiento=None, csv_path=DEFAULT_CSV):
    """Entrena una vez por consulta y evalúa los escenarios de sus rotaciones.

    Cada escenario exige fecha, lluvia acumulada en los 15 días previos,
    profundidad de napa y humedad de esa fecha, recibidas del motor de cultivo.
    """
    dataset = pd.read_csv(csv_path)
    lot = validate_polygon(poligono_lote) if poligono_lote is not None else None
    lot_origin = "poligono_aportado" if lot is not None else "huella_grilla_no_limite_real_del_lote"
    if grilla_anegamiento is not None:
        grid, cells = _custom_grid(grilla_anegamiento)
        origin = "grilla_aportada_por_usuario_no_verificada"
        grid_date = None
    else:
        grid_date = sorted(dataset["event_date"].unique())[-1]
        grid = dataset[dataset["event_date"] == grid_date].copy().reset_index(drop=True)
        cells = cells_from_centers(grid)
        origin = "demo_casilda_no_validada_en_campo"
        if lot is None and not unary_union(cells).covers(Point(lon, lat)):
            return {key: empty_layer("No hay relieve y suelo por zona para esta ubicación; enviar grilla_anegamiento") for key in scenarios}
    reference_elevation = float(np.average(grid["elev_srtm_m"], weights=[area_ha(c) for c in cells]))
    grid, cells, lot = clip_cells(grid, cells, lot)
    if not cells:
        return {key: empty_layer("El lote no intersecta la cobertura de la grilla disponible") for key in scenarios}

    # Reservar eventos completos evita mezclar píxeles del mismo evento en train/test.
    test_date = sorted(dataset["event_date"].unique())[-1]
    train = dataset[dataset["event_date"] < test_date]
    test = dataset[dataset["event_date"] == test_date]
    if train["sentinel_anegado_target"].nunique() < 2:
        raise ValueError("El entrenamiento de anegamiento requiere dos clases")
    model = xgb.XGBClassifier(n_estimators=250, max_depth=5, learning_rate=0.05,
                             subsample=0.85, colsample_bytree=0.85, tree_method="hist",
                             device="cpu", n_jobs=2, random_state=42, eval_metric="logloss")
    model.fit(train[FEATURES], train["sentinel_anegado_target"])
    probs_test = model.predict_proba(test[FEATURES])[:, 1]
    metrics = {"evento_test": str(test_date), "particion": "evento_temporal_completo",
               "roc_auc": round(float(roc_auc_score(test["sentinel_anegado_target"], probs_test)), 4) if test["sentinel_anegado_target"].nunique() == 2 else None,
               "f1_score": round(float(f1_score(test["sentinel_anegado_target"], probs_test >= 0.5, zero_division=0)), 4),
               "alcance": "evaluacion_interna_demo; sin validacion geografica ni calibracion de probabilidades",
               "entrenamiento_desde": str(train["event_date"].min()),
               "entrenamiento_hasta": str(train["event_date"].max())}
    areas = np.array([area_ha(c) for c in cells])
    lot_area = area_ha(lot)
    results = {}
    for key, scenario in scenarios.items():
        if scenario is None:
            results[key] = empty_layer("Faltan lluvia de 15 días, napa o humedad para la fecha evaluada")
            continue
        rain, depth, moisture = (float(scenario[k]) for k in ("lluvia_15d_mm", "napa_m", "humedad_m3m3"))
        if not all(math.isfinite(v) for v in (rain, depth, moisture)) or rain < 0 or depth < 0 or not 0 <= moisture <= 1:
            raise ValueError("Escenario hídrico fuera de rango")
        prediction_grid = grid.copy()
        prediction_grid["rain_15d_mm"] = rain
        # Aproximación explícita de superficie freática plana.
        prediction_grid["napa_local_m"] = (depth + prediction_grid["elev_srtm_m"] - reference_elevation).clip(lower=0.1)
        prediction_grid["smap_rootzone_sm"] = moisture
        probabilities = model.predict_proba(prediction_grid[FEATURES])[:, 1].astype(float)
        features = []
        for index, row in prediction_grid.iterrows():
            pct = round(float(probabilities[index]) * 100, 2)
            features.append({"type": "Feature", "id": str(row["pixel_id"]),
                             "geometry": geojson_geometry(cells[index]),
                             "properties": {"probabilidad_anegamiento_pct": pct,
                                            "categoria_riesgo": category(pct), "unidad": "%",
                                            "fecha": scenario["fecha"],
                                            "superficie_ha": round(float(areas[index]), 6),
                                            "napa_local_estimada_m": round(float(row["napa_local_m"]), 3),
                                            "lluvia_15d_mm": round(rain, 2), "humedad_m3m3": round(moisture, 4),
                                            "origen_datos": origin}})
        coverage = min(100.0, float(areas.sum()) / lot_area * 100)
        high = np.array([category(round(p * 100, 2)) == "Alto" for p in probabilities])
        results[key] = {"estado": "calculado" if coverage >= 99.99 else "parcial",
                        "modelo": "XGBoost Spatial Waterlogging Classifier",
                        "calculado_en_ejecucion": True, "origen_datos": origin,
                        "origen_limite_lote": lot_origin,
                        "fecha_grilla_referencia": str(grid_date) if grid_date else None,
                        "tipo_resultado": "escenario_retrospectivo; probabilidades_del_modelo_no_calibradas",
                        "metodo_napa_local": "napa del escenario + diferencia de elevacion; superficie freatica plana aproximada",
                        "escenario": scenario, "metrics_test": metrics,
                        "resumen": {"probabilidad_media_anegamiento_pct": round(float(np.average(probabilities, weights=areas)) * 100, 2),
                                    "superficie_riesgo_alto_pct": round(float(areas[high].sum() / areas.sum()) * 100, 2),
                                    "superficie_evaluada_ha": round(float(areas.sum()), 4),
                                    "superficie_lote_ha": round(lot_area, 4),
                                    "cobertura_lote_pct": round(coverage, 2), "cantidad_zonas": len(features),
                                    "umbrales_pct": {"bajo": "0 a 30 inclusive", "medio": "mayor que 30 hasta 65 inclusive", "alto": "mayor que 65"}},
                        "geojson": {"type": "FeatureCollection", "features": features}}
    return results


def train_spatial_waterlogging_model(csv_path=DEFAULT_CSV,
                                    output_map_json="outputs/mapa_riesgo_anegamiento_lote.json",
                                    *, lluvia_15d_mm=None, napa_m=None, humedad_m3m3=None):
    """Compatibilidad del script: por defecto usa el último evento del CSV demo."""
    dataset = pd.read_csv(csv_path)
    date = sorted(dataset["event_date"].unique())[-1]
    event = dataset[dataset["event_date"] == date]
    scenario = {"fecha": str(date), "lluvia_15d_mm": float(event["rain_15d_mm"].mean()) if lluvia_15d_mm is None else lluvia_15d_mm,
                "napa_m": float(event["napa_local_m"].mean()) if napa_m is None else napa_m,
                "humedad_m3m3": float(event["smap_rootzone_sm"].mean()) if humedad_m3m3 is None else humedad_m3m3}
    result = train_and_predict_waterlogging({"evento": scenario}, lat=float(event.lat.mean()), lon=float(event.lon.mean()), csv_path=csv_path)["evento"]
    if output_map_json:
        path = Path(output_map_json)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
    return result


if __name__ == "__main__":
    result = train_spatial_waterlogging_model()
    print(json.dumps(result["resumen"], ensure_ascii=False))
