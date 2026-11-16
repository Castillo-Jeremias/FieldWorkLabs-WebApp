"""
MODELO 4: Surrogate Neural/Ensemble + Simulación Monte Carlo de Riesgo (10.000 escenarios)
Entrena un emulador de Machine Learning sobre corridas biofísicas para predecir:
- Rendimiento esperado e intervalos de incertidumbre (P10, P50, P90)
- Probabilidad de quiebre / pérdida (< umbral económico) para Bancos, Fintech y Aseguradoras
- Estrés hídrico y por anegamiento acoplado a la variabilidad de napa
Instalar antes: pip install scikit-learn xgboost pandas numpy
"""
import json
import numpy as np
import pandas as pd
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error

def generate_biophysical_training_corpus(n_samples: int = 2500) -> pd.DataFrame:
    """
    Genera el dataset de entrenamiento multi-escenario (curva de respuesta biofísica de cultivos
    ante napa freática, lluvia de campaña, ET0, agua útil inicial y cobertura de rastrojo).
    """
    rng = np.random.default_rng(42)
    rot_id = rng.choice([0, 1, 2], size=n_samples)  # 0: Soja 1ra, 1: Trigo/Soja2da->Maiz, 2: Maiz Tardio->Soja
    rain_season_mm = rng.uniform(280, 950, size=n_samples)
    et0_season_mm = rng.uniform(520, 820, size=n_samples)
    napa_depth_m = rng.uniform(0.6, 4.0, size=n_samples)
    initial_water_mm = rng.uniform(80, 240, size=n_samples)
    mulch_pct = rng.uniform(30, 95, size=n_samples)
    low_area_risk_pct = np.clip(100 * np.exp(-1.4 * napa_depth_m) * (rain_season_mm / 700), 0, 85)

    # Respuesta no lineal: napa óptima entre 1.4m y 2.2m (aporte capilar); <1.0m penaliza por anoxia; >3.0m sin aporte
    capillary_bonus = np.exp(-((napa_depth_m - 1.75) ** 2) / 0.45)
    waterlogging_penalty = np.where(napa_depth_m < 1.15, (1.15 - napa_depth_m) * 2.8 * (rain_season_mm / 650), 0.0)
    water_supply = rain_season_mm + 0.65 * initial_water_mm + 160 * capillary_bonus + 0.4 * mulch_pct
    drought_stress = np.clip((et0_season_mm - water_supply) / et0_season_mm, 0.0, 0.75)

    # Rendimiento equivalente en Soja-equivalente (tn/ha anualizado) según rotación
    base_pot = np.select([rot_id == 0, rot_id == 1, rot_id == 2], [4.2, 6.1, 5.4])
    sensitivity_anoxia = np.select([rot_id == 0, rot_id == 1, rot_id == 2], [1.1, 0.75, 0.85])  # Rot 1 sufre más anegamiento
    sensitivity_drought = np.select([rot_id == 0, rot_id == 1, rot_id == 2], [1.05, 0.90, 0.70]) # Rot 3 (Maíz tardío) más estable en seca

    yield_eq = (
        base_pot
        * (1.0 - sensitivity_drought * drought_stress)
        - sensitivity_anoxia * waterlogging_penalty
        + rng.normal(0, 0.15, size=n_samples)
    )
    yield_eq = np.clip(yield_eq, 0.5, 7.5)

    return pd.DataFrame({
        "rot_id": rot_id,
        "rain_season_mm": rain_season_mm.round(1),
        "et0_season_mm": et0_season_mm.round(1),
        "napa_depth_m": napa_depth_m.round(2),
        "initial_water_mm": initial_water_mm.round(1),
        "mulch_pct": mulch_pct.round(1),
        "low_area_risk_pct": low_area_risk_pct.round(1),
        "yield_soja_eq_tn_ha": yield_eq.round(3)
    })

def train_and_run_montecarlo(
    corpus_csv: str = "data/corpus_entrenamiento_surrogate.csv",
    output_json: str = "outputs/riesgo_probabilistico_montecarlo.json"
):
    df = pd.read_csv(corpus_csv)
    features = ["rot_id", "rain_season_mm", "et0_season_mm", "napa_depth_m", "initial_water_mm", "mulch_pct", "low_area_risk_pct"]
    X = df[features]
    y = df["yield_soja_eq_tn_ha"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Red Neuronal (MLP Surrogate) para inferencia rápida sobre miles de realizaciones climáticas
    surrogate = make_pipeline(
        StandardScaler(),
        MLPRegressor(hidden_layer_sizes=(128, 64, 32), activation="relu", max_iter=400, random_state=42)
    )
    surrogate.fit(X_train, y_train)

    preds_test = surrogate.predict(X_test)
    r2 = float(r2_score(y_test, preds_test))
    mae = float(mean_absolute_error(y_test, preds_test))

    # Simulación Monte Carlo (N = 5.000 trayectorias por rotación) bajo incertidumbre de clima y napa
    rng = np.random.default_rng(123)
    n_mc = 5000
    rot_names = {
        0: "Rotación 1: Monocultivo Soja 1ra",
        1: "Rotación 2: Trigo/Soja 2da -> Maíz Temprano",
        2: "Rotación 3: Maíz Tardío -> Soja 1ra"
    }
    umbral_quiebre_tn = 2.8  # Rinde de indiferencia / cobertura de costos para Bancos y Seguros

    mc_results = []
    for r_id, r_name in rot_names.items():
        rain_mc = rng.normal(580, 140, size=n_mc).clip(250, 980)
        et0_mc = rng.normal(660, 55, size=n_mc).clip(500, 830)
        napa_mc = rng.normal(1.65, 0.45, size=n_mc).clip(0.5, 3.8)
        init_w_mc = rng.normal(165, 25, size=n_mc).clip(80, 230)
        mulch_mc = np.full(n_mc, 55.0 if r_id == 0 else 80.0)
        risk_mc = np.clip(100 * np.exp(-1.4 * napa_mc) * (rain_mc / 700), 0, 85)

        X_mc = pd.DataFrame({
            "rot_id": np.full(n_mc, r_id),
            "rain_season_mm": rain_mc,
            "et0_season_mm": et0_mc,
            "napa_depth_m": napa_mc,
            "initial_water_mm": init_w_mc,
            "mulch_pct": mulch_mc,
            "low_area_risk_pct": risk_mc
        })

        y_mc = surrogate.predict(X_mc)
        prob_loss = float((y_mc < umbral_quiebre_tn).mean() * 100)

        mc_results.append({
            "rotacion_id": f"rot_{r_id+1}",
            "nombre": r_name,
            "rinde_esperado_media_tn_ha": round(float(np.mean(y_mc)), 2),
            "p10_escenario_malo_tn_ha": round(float(np.percentile(y_mc, 10)), 2),
            "p50_mediana_tn_ha": round(float(np.percentile(y_mc, 50)), 2),
            "p90_escenario_bueno_tn_ha": round(float(np.percentile(y_mc, 90)), 2),
            "volatilidad_std_tn_ha": round(float(np.std(y_mc)), 2),
            "probabilidad_quiebre_bajo_2_8tn_pct": round(prob_loss, 1)
        })

    output_data = {
        "modelo": "MLP Neural Surrogate + Monte Carlo Risk Engine (N=5000/rotación)",
        "metrics_test": {"r2_score": round(r2, 4), "mae_tn_ha": round(mae, 4)},
        "umbral_indiferencia_economica_tn_ha": umbral_quiebre_tn,
        "comparativa_riesgo_rotaciones": mc_results
    }

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2)

    print(f"[Modelo 4 - Neural Surrogate + Monte Carlo] R2 Test: {r2:.3f} | MAE: {mae:.3f} tn/ha")
    return output_data

if __name__ == "__main__":
    import os
    os.makedirs("outputs", exist_ok=True)
    train_and_run_montecarlo()
