"""Geometrías y superficies para capas GeoJSON en longitud, latitud."""
import math

import numpy as np
from pyproj import Geod
from shapely.geometry import MultiPolygon, Polygon, box, mapping, shape
from shapely.geometry.polygon import orient
from shapely.errors import ShapelyError
from shapely.ops import unary_union

GEOD = Geod(ellps="WGS84")


def validate_polygon(geometry):
    if not isinstance(geometry, dict) or geometry.get("type") not in ("Polygon", "MultiPolygon"):
        raise ValueError("El lote debe ser una geometría GeoJSON Polygon o MultiPolygon")
    try:
        polygon = shape(geometry)
    except (TypeError, ValueError, IndexError, AttributeError, ShapelyError) as exc:
        raise ValueError("Coordenadas del polígono inválidas") from exc
    if polygon.is_empty or not polygon.is_valid or polygon.area <= 0:
        raise ValueError("El polígono debe ser válido, sin cruces y con superficie positiva")
    west, south, east, north = polygon.bounds
    if not all(math.isfinite(v) for v in polygon.bounds) or not (-180 <= west < east <= 180 and -90 < south < north < 90):
        raise ValueError("Coordenadas fuera de rango; usar [longitud, latitud]")
    if east - west > 2 or north - south > 2:
        raise ValueError("La capa admite lotes de hasta 2 grados de extensión, sin cruzar el antimeridiano")
    return polygon


def polygon_parts(geometry):
    if isinstance(geometry, Polygon):
        return [geometry] if geometry.area > 0 else []
    return [p for child in getattr(geometry, "geoms", []) for p in polygon_parts(child)]


def polygon_geometry(geometry):
    parts = polygon_parts(geometry)
    return None if not parts else parts[0] if len(parts) == 1 else MultiPolygon(parts)


def area_ha(geometry):
    return sum(abs(GEOD.geometry_area_perimeter(orient(p, sign=1))[0]) for p in polygon_parts(geometry)) / 10000.0


def _edges(values):
    values = np.sort(np.unique(values))
    if len(values) < 2:
        raise ValueError("Se necesitan al menos dos filas y columnas para inferir celdas de los puntos")
    delta = np.diff(values)
    if not np.allclose(delta, np.median(delta), rtol=0.01, atol=1e-8):
        raise ValueError("La grilla de puntos debe ser regular; para otras grillas enviar polígonos")
    return values, np.r_[values[0] - delta[0] / 2, (values[:-1] + values[1:]) / 2, values[-1] + delta[-1] / 2]


def cells_from_centers(frame):
    xs, xe = _edges(frame["lon"].to_numpy())
    ys, ye = _edges(frame["lat"].to_numpy())
    if frame.duplicated(["lat", "lon"]).any() or len(frame) != len(xs) * len(ys):
        raise ValueError("La grilla de centros debe ser rectangular, completa y sin duplicados")
    return [box(xe[np.searchsorted(xs, r.lon)], ye[np.searchsorted(ys, r.lat)],
                xe[np.searchsorted(xs, r.lon) + 1], ye[np.searchsorted(ys, r.lat) + 1])
            for r in frame.itertuples()]


def clip_cells(frame, cells, lot=None):
    lot = lot if lot is not None else unary_union(cells)
    clipped, indexes = [], []
    for index, cell in enumerate(cells):
        geom = polygon_geometry(cell.intersection(lot))
        if geom is not None and area_ha(geom) > 1e-8:
            clipped.append(geom)
            indexes.append(index)
    return frame.iloc[indexes].reset_index(drop=True), clipped, lot


def geojson_geometry(geometry):
    return mapping(geometry)
