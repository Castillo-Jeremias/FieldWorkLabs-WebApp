"""API JSON de HYDRA. Entrenamiento y predicción se ejecutan en cada consulta."""
import math
from datetime import date
from typing import Dict, List, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from shapely.geometry import Point

from geospatial import validate_polygon
from train_xgboost_anegamiento import validate_grid


class SimInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    lat: float = Field(default=-33.04, ge=-90, le=90)
    lon: float = Field(default=-61.16, ge=-180, le=180)
    napa_m: Optional[float] = Field(default=None, ge=0.1, le=20)
    escenario_clima: Literal["seco", "habitual", "humedo"] = "habitual"
    asimilacion_tiempo_real: bool = True
    usar_historial_lote: bool = False
    historial_rinde_soja_tn_ha: Optional[List[float]] = None
    mapa_rinde_ambientes_tn_ha: Optional[Dict[str, float]] = None
    fecha_evaluacion: Optional[date] = None
    poligono_lote: Optional[dict] = None
    grilla_anegamiento: Optional[dict] = None

    @field_validator("poligono_lote")
    @classmethod
    def check_polygon(cls, value):
        if value is not None:
            validate_polygon(value)
        return value

    @field_validator("grilla_anegamiento")
    @classmethod
    def check_grid(cls, value):
        return validate_grid(value) if value is not None else None

    @field_validator("historial_rinde_soja_tn_ha", "mapa_rinde_ambientes_tn_ha")
    @classmethod
    def check_yields(cls, value):
        items = value.values() if isinstance(value, dict) else value or []
        if any(not math.isfinite(v) or v < 0 for v in items):
            raise ValueError("Los rendimientos deben ser finitos y no negativos")
        return value

    @model_validator(mode="after")
    def location_in_lot(self):
        if self.poligono_lote is not None:
            polygon = validate_polygon(self.poligono_lote)
            if not polygon.covers(Point(self.lon, self.lat)):
                raise ValueError("lat y lon deben estar dentro de poligono_lote")
        return self


def run_simulation(req: SimInput):
    from run_aquacrop import run_aquacrop_rotations
    try:
        result = run_aquacrop_rotations(
            lat=req.lat, lon=req.lon, output_json=None, napa_override_m=req.napa_m,
            escenario_clima=req.escenario_clima, asimilacion_tiempo_real=req.asimilacion_tiempo_real,
            historial_rinde_soja_tn_ha=req.historial_rinde_soja_tn_ha if req.usar_historial_lote else None,
            mapa_rinde_ambientes_tn_ha=req.mapa_rinde_ambientes_tn_ha if req.usar_historial_lote else None,
            fecha_evaluacion=req.fecha_evaluacion.isoformat() if req.fecha_evaluacion else None,
            poligono_lote=req.poligono_lote, grilla_anegamiento=req.grilla_anegamiento,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result["ejecucion_id"] = str(uuid4())
    result["riesgo_hidrico"]["ejecucion_id"] = result["ejecucion_id"]
    return result


router = APIRouter(prefix="/api/v1")


@router.post("/riesgo-hidrico")
def water_risk(req: SimInput):
    return run_simulation(req)["riesgo_hidrico"]


@router.post("/simular")
def simulate(req: SimInput):
    return run_simulation(req)


app = FastAPI(title="HYDRA — Agua y riesgo hídrico", version="1.0")
app.include_router(router)
