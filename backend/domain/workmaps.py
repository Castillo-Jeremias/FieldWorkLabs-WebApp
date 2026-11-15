"""Validación y representación común de mapas de trabajo."""
import math

MEASUREMENTS = {'yield_t_ha': (0, None), 'area_ha': (0, None),
                'moisture_pct': (0, 100), 'speed_kmh': (0, None),
                'elevation_m': (None, None)}
MAX_RECORDS = 50000


def number(value, name, low=None, high=None):
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        raise ValueError(f'{name}: se requiere un número')
    try:
        result = float(str(value).replace(',', '.'))
    except (ValueError, TypeError) as exc:
        raise ValueError(f'{name}: se requiere un número') from exc
    if not math.isfinite(result) or (low is not None and result < low) or (high is not None and result > high):
        raise ValueError(f'{name}: valor fuera de rango')
    return result


def validateGeometry(geometry):
    if not isinstance(geometry, dict):
        raise ValueError('Se requiere geometría GeoJSON')
    kind, coords = geometry.get('type'), geometry.get('coordinates')
    def point(p):
        if not isinstance(p, list) or len(p) not in (2, 3):
            raise ValueError('Coordenadas inválidas')
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in p):
            raise ValueError('Las coordenadas deben ser números finitos')
        number(p[0], 'longitud', -180, 180)
        number(p[1], 'latitud', -90, 90)
    def polygon(rings):
        if not isinstance(rings, list) or not rings:
            raise ValueError('Polígono vacío')
        for ring in rings:
            if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError('El anillo debe estar cerrado y tener al menos cuatro posiciones')
            for p in ring:
                point(p)
    if kind == 'Point':
        point(coords)
    elif kind == 'Polygon':
        polygon(coords)
    elif kind == 'MultiPolygon' and isinstance(coords, list) and coords:
        for rings in coords:
            polygon(rings)
    else:
        raise ValueError('Geometrías admitidas: Point, Polygon y MultiPolygon en WGS84')
    return geometry


def mapMetadata(data):
    """Vista de catálogo sin registros ni contenido original."""
    return {key: value for key, value in data.items() if key not in ('records', 'original_content')}


def summarizeRecords(records):
    """Resumen común; el rendimiento usa únicamente áreas positivas emparejadas."""
    paired = [r for r in records if r['yield_t_ha'] is not None and r['area_ha'] is not None and r['area_ha'] > 0]
    pairedArea = sum(r['area_ha'] for r in paired)
    yields = [r['yield_t_ha'] for r in records if r['yield_t_ha'] is not None]
    areaRows = [r['area_ha'] for r in records if r['area_ha'] is not None]
    return dict(record_count=len(records), area_ha=sum(areaRows) if areaRows else None,
                   yield_t_ha=sum(r['yield_t_ha'] * r['area_ha'] for r in paired) / pairedArea if pairedArea else None,
                   yield_mean_t_ha=sum(yields) / len(yields) if yields else None,
                   yield_covered_area_ha=pairedArea,
                   missing={key: sum(r[key] is None for r in records) for key in MEASUREMENTS},
                   georeferenced_count=sum(r['geometry'] is not None for r in records),
                   warnings=['La superficie es la suma declarada por registro; no se detectan solapamientos ni duplicados.',
                             'El rendimiento ponderado usa solo registros con rendimiento y superficie positiva. No se corrige por humedad.'])
