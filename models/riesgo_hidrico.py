"""Contrato de agua para el frontend, construido desde la simulación de cada consulta."""
from datetime import date

import pandas as pd

from train_xgboost_anegamiento import empty_layer, train_and_predict_waterlogging


def _trend(series):
    last = series[-1]
    last_date = date.fromisoformat(last["fecha"])
    recent = [s for s in series if 0 <= (last_date - date.fromisoformat(s["fecha"])).days <= 30
              and s["cultivo"] == last["cultivo"]]
    if len(recent) < 2:
        return {"estado": "sin_datos", "direccion": None, "cambio_cm_semana": None}
    first = recent[0]
    days = (last_date - date.fromisoformat(first["fecha"])).days
    change = (last["napa_acoplada_nivel_3_m"] - first["napa_acoplada_nivel_3_m"]) * 100 * 7 / days
    return {"estado": "calculado", "direccion": "profundizandose" if change > 0.5 else "subiendo_hacia_superficie" if change < -0.5 else "estable",
            "cambio_cm_semana": round(change, 2), "desde": first["fecha"], "hasta": last["fecha"],
            "convencion": "positivo = mayor profundidad; negativo = ascenso hacia superficie",
            "metodo": "cambio entre extremos de hasta 30 dias del mismo cultivo; estable entre -0.5 y +0.5 cm/semana"}


def build_water_risk(simulation, weather_df, *, fecha_evaluacion=None,
                     poligono_lote=None, grilla_anegamiento=None):
    """Se ejecuta después de AquaCrop; no usa probabilidades precomputadas.

    La fecha de foto es una muestra de la serie; balances y días de estrés son
    totales de las campañas completas, con su período explícito por separado.
    """
    weather = weather_df.copy()
    weather["Date"] = pd.to_datetime(weather["Date"])
    if weather["Date"].duplicated().any():
        raise ValueError("El clima no debe tener fechas duplicadas")
    requested = date.fromisoformat(fecha_evaluacion) if fecha_evaluacion else None
    rotations = simulation["comparativa_rotaciones"]
    all_dates = [date.fromisoformat(s["fecha"]) for r in rotations.values() for s in r["serie_temporal_fao_nasa"]]
    if requested and (not all_dates or not min(all_dates) <= requested <= max(all_dates)):
        raise ValueError("fecha_evaluacion debe estar dentro del período histórico simulado; no es una lectura actual")
    results, scenarios = {}, {}
    for key, rotation in rotations.items():
        series = sorted([s for s in rotation["serie_temporal_fao_nasa"] if requested is None or date.fromisoformat(s["fecha"]) <= requested], key=lambda s: s["fecha"])
        if not series:
            results[key] = {"estado": "sin_datos", "motivo": "No hay muestras de esta rotación hasta la fecha solicitada",
                            "anegamiento": empty_layer("Sin escenario para esa fecha")}
            scenarios[key] = None
            continue
        snapshot = series[-1]
        day = pd.Timestamp(snapshot["fecha"])
        rainfall = weather.loc[(weather["Date"] >= day - pd.Timedelta(days=14)) & (weather["Date"] <= day)]
        rain_15d = round(float(rainfall["Precipitation"].sum()), 2) if len(rainfall) == 15 and rainfall["Precipitation"].notna().all() else None
        moisture = snapshot["humedad_0_100cm_asimilada_m3m3"]
        depth = snapshot["napa_acoplada_nivel_3_m"]
        scenarios[key] = {"fecha": snapshot["fecha"], "lluvia_15d_mm": rain_15d,
                          "napa_m": depth, "humedad_m3m3": moisture,
                          "fuente_lluvia": simulation["ubicacion"]["fuente_nasa"],
                          "fuente_humedad": "humedad_del_motor_con_asimilacion_si_esta_activa"} if rain_15d is not None else None
        campaigns = rotation["campanas_simuladas"]
        balances = [s["balance_hidrico_mm"] for s in campaigns]
        def total(field):
            return round(sum(b[field] for b in balances), 2)
        depths = [s["napa_acoplada_nivel_3_m"] for s in series]
        results[key] = {
            "estado": "calculado", "nombre": rotation["nombre"],
            "fecha_evaluacion": snapshot["fecha"], "fecha_solicitada": fecha_evaluacion,
            "napa": {"profundidad_m": depth, "profundidad_natural_m": snapshot["napa_natural_nivel_1_2_m"],
                     "unidad": "m_bajo_superficie", "min_m": round(min(depths), 3), "max_m": round(max(depths), 3),
                     "media_m": round(sum(depths) / len(depths), 3),
                     "periodo_estadisticas": {"desde": series[0]["fecha"], "hasta": snapshot["fecha"], "muestreo": "muestras_disponibles_de_cultivos; no incluye barbechos"},
                     "tendencia": _trend(series)},
            "humedad": {"unidad": "m3/m3", "profundidad_capas_cm": [[0, 20], [20, 50], [50, 100], [100, 200]],
                        "capas": snapshot["capas_suelo_m3m3"], "origen_capas": "simulacion_aquacrop",
                        "raiz_0_100cm_m3m3": moisture, "origen_raiz": "motor_con_asimilacion_si_esta_activa"},
            "lluvia_ultimos_15_dias_mm": rain_15d,
            "balance_campanas": {"unidad": "mm", "alcance": "suma_de_campanas_completas_sin_barbechos; no_acumulado_hasta_fecha_evaluacion",
                                 "desde": min(s["fecha_inicio"] for s in campaigns).replace("/", "-"),
                                 "hasta": max(s["fecha_fin"] for s in campaigns).replace("/", "-"),
                                 "lluvia_acumulada_mm": total("lluvia_ciclo_mm"),
                                 "demanda_atmosferica_et0_mm": total("et0_demanda_mm"),
                                 "transpiracion_cultivo_mm": total("transpiracion_real_tr_mm"),
                                 "evaporacion_suelo_mm": total("evaporacion_suelo_es_mm"),
                                 "consumo_total_et_mm": round(total("transpiracion_real_tr_mm") + total("evaporacion_suelo_es_mm"), 2),
                                 "aporte_napa_capilar_mm": total("ascenso_capilar_napa_cr_mm"),
                                 "percolacion_profunda_mm": total("percolacion_profunda_dp_mm")},
            "estres_campanas": {"alcance": "campanas_completas_sin_barbechos; mismo_periodo_que_balance_campanas",
                                "dias_sequia": sum(s["estres_fao_dias"]["dias_estres_sequia_sto"] for s in campaigns),
                                "dias_anegamiento": sum(s["estres_fao_dias"]["dias_estres_anegamiento_aer"] for s in campaigns)},
            "campanas": [{"cultivo": s["cultivo"], "desde": s["fecha_inicio"].replace("/", "-"), "hasta": s["fecha_fin"].replace("/", "-"),
                          "balance_hidrico_mm": s["balance_hidrico_mm"], "estres_dias": s["estres_fao_dias"]} for s in campaigns],
            "evolucion": [{"fecha": s["fecha"], "cultivo": s["cultivo"], "napa_m": s["napa_acoplada_nivel_3_m"],
                           "napa_natural_m": s["napa_natural_nivel_1_2_m"], "humedad_raiz_m3m3": s["humedad_0_100cm_asimilada_m3m3"],
                           "humedad_capas_m3m3": s["capas_suelo_m3m3"]} for s in series]}
    layers = train_and_predict_waterlogging(scenarios, lat=simulation["ubicacion"]["lat"], lon=simulation["ubicacion"]["lon"],
                                           poligono_lote=poligono_lote, grilla_anegamiento=grilla_anegamiento)
    for key in results:
        results[key]["anegamiento"] = layers[key]
    return {"schema_version": "1.0", "tipo": "riesgo_hidrico", "modo": "simulacion_historica",
            "ubicacion": simulation["ubicacion"],
            "fuentes": {"clima": simulation["ubicacion"]["fuente_nasa"],
                        "napa": simulation["escenario_evaluado"]["origen_napa_3_niveles"],
                        "nota": "Resultados estimados. El dataset local de referencia y sus indicadores derivados no acreditan observaciones de campo. Ver origen de cada capa."},
            "por_rotacion": results}
