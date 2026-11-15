"""Ingesta de mediciones reales, sin inferencia ni dependencias geoespaciales."""
import csv
import io
import json
import math
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

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


class WorkMapRepository:
    def __init__(self, path):
        self.m_path = Path(path)
        self.m_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute('CREATE TABLE IF NOT EXISTS work_maps (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)')

    def connect(self):
        return sqlite3.connect(self.m_path, timeout=15)

    def save(self, data):
        with self.connect() as connection:
            connection.execute('INSERT INTO work_maps VALUES (?, ?, ?)',
                               (data['id'], data['created_at'], json.dumps(data, allow_nan=False)))

    def listMaps(self):
        with self.connect() as connection:
            rows = connection.execute('SELECT payload FROM work_maps ORDER BY created_at DESC').fetchall()
        return [{k: v for k, v in json.loads(row[0]).items() if k not in ('records', 'original_content')} for row in rows]

    def getMap(self, mapId):
        with self.connect() as connection:
            row = connection.execute('SELECT payload FROM work_maps WHERE id = ?', (mapId,)).fetchone()
        if row is None:
            raise KeyError(mapId)
        return json.loads(row[0])


class WorkMapService:
    def __init__(self, repository, examples=None):
        self.m_repository = repository
        self.m_examples = examples

    def listMaps(self):
        return self.m_repository.listMaps() + (self.m_examples.listMaps() if self.m_examples else [])

    def getMap(self, mapId):
        try:
            return self.m_repository.getMap(mapId)
        except KeyError:
            if self.m_examples is None:
                raise
            return self.m_examples.getMap(mapId)

    def importMap(self, payload):
        if not isinstance(payload, dict):
            raise ValueError('Se requiere un objeto JSON')
        metadata = {}
        for key in ('field', 'crop', 'campaign', 'date', 'operation', 'source', 'filename'):
            value = payload.get(key)
            if not isinstance(value, str) or not value.strip() or len(value) > 250:
                raise ValueError(f'{key}: campo obligatorio (máximo 250 caracteres)')
            metadata[key] = value.strip()
        try:
            date.fromisoformat(metadata['date'])
        except ValueError as exc:
            raise ValueError('Fecha inválida: usar AAAA-MM-DD') from exc
        content = payload.get('content')
        if not isinstance(content, str) or not content.strip():
            raise ValueError('El archivo está vacío')
        content = content.lstrip('\ufeff')
        filename = metadata['filename'].lower()
        if filename.endswith('.csv'):
            try:
                dialect = csv.Sniffer().sniff(content[:8192], delimiters=',;\t')
            except csv.Error:
                dialect = csv.excel
            reader = csv.DictReader(io.StringIO(content), dialect=dialect)
            headers = reader.fieldnames
            if not headers or len(headers) != len(set(headers)) or any(not h for h in headers):
                raise ValueError('Encabezados CSV vacíos o duplicados')
            def features():
                for row in reader:
                    if None in row or any(v is None for v in row.values()):
                        raise ValueError('Cantidad de columnas CSV inconsistente')
                    lat = number(row.get('latitude'), 'latitude', -90, 90)
                    lon = number(row.get('longitude'), 'longitude', -180, 180)
                    if (lat is None) != (lon is None):
                        raise ValueError('Se requieren latitude y longitude juntas')
                    yield row, None if lat is None else {'type': 'Point', 'coordinates': [lon, lat]}
            rows = features()
            formatName = 'csv'
        elif filename.endswith(('.geojson', '.json')):
            try:
                collection = json.loads(content)
            except (ValueError, RecursionError) as exc:
                raise ValueError('GeoJSON inválido') from exc
            if not isinstance(collection, dict) or collection.get('type') != 'FeatureCollection' or not isinstance(collection.get('features'), list):
                raise ValueError('Se requiere un FeatureCollection GeoJSON')
            if 'crs' in collection:
                raise ValueError('Convertí el archivo a GeoJSON WGS84 sin crs')
            def features():
                for feature in collection['features']:
                    if not isinstance(feature, dict) or feature.get('type') != 'Feature' or not isinstance(feature.get('properties'), dict):
                        raise ValueError('Feature o properties inválidos')
                    yield feature['properties'], validateGeometry(feature.get('geometry'))
            rows = features()
            formatName = 'geojson'
        else:
            raise ValueError('Formato admitido: CSV o GeoJSON')
        records = []
        try:
            for index, (properties, geometry) in enumerate(rows, 1):
                if index > MAX_RECORDS:
                    raise ValueError(f'Máximo {MAX_RECORDS} registros por archivo')
                values = {key: number(properties.get(key), key, *limits) for key, limits in MEASUREMENTS.items()}
                flags = ['missing_' + key for key in MEASUREMENTS if values[key] is None]
                if geometry is None:
                    flags.append('missing_geometry')
                if values['area_ha'] == 0:
                    flags.append('zero_area')
                records.append(dict(record_id=index, **values, geometry=geometry,
                                    quality_flags=flags, raw_properties=properties))
        except (ValueError, csv.Error) as exc:
            raise ValueError(f'Registro {len(records) + 1}: {exc}') from exc
        if not records:
            raise ValueError('El archivo no contiene registros')
        if not any(r[key] is not None for r in records for key in MEASUREMENTS) and not any(
                r['geometry'] and r['geometry']['type'] in ('Polygon', 'MultiPolygon') for r in records):
            raise ValueError('No se encontraron variables. Usá los nombres de variables admitidos; unidades: t/ha, ha, %, km/h y m')
        paired = [r for r in records if r['yield_t_ha'] is not None and r['area_ha'] is not None and r['area_ha'] > 0]
        pairedArea = sum(r['area_ha'] for r in paired)
        yields = [r['yield_t_ha'] for r in records if r['yield_t_ha'] is not None]
        areaRows = [r['area_ha'] for r in records if r['area_ha'] is not None]
        summary = dict(record_count=len(records), area_ha=sum(areaRows) if areaRows else None,
                       yield_t_ha=sum(r['yield_t_ha'] * r['area_ha'] for r in paired) / pairedArea if pairedArea else None,
                       yield_mean_t_ha=sum(yields) / len(yields) if yields else None,
                       yield_covered_area_ha=pairedArea,
                       missing={key: sum(r[key] is None for r in records) for key in MEASUREMENTS},
                       georeferenced_count=sum(r['geometry'] is not None for r in records),
                       warnings=['La superficie es la suma declarada por registro; no se detectan solapamientos ni duplicados.',
                                 'El rendimiento ponderado usa solo registros con rendimiento y superficie positiva. No se corrige por humedad.'])
        result = dict(metadata, id=uuid4().hex, created_at=datetime.now(timezone.utc).isoformat(),
                      schema_version=1, format=formatName, demo=False, summary=summary,
                      records=records, original_content=payload['content'])
        self.m_repository.save(result)
        return {k: v for k, v in result.items() if k not in ('records', 'original_content')}

    def exportDataset(self, mapId, formatName):
        if formatName != 'json':
            raise ValueError('Formato de exportación inválido')
        data = self.getMap(mapId)
        data.pop('original_content')
        return json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8')
