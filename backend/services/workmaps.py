"""Importación, consulta y exportación de mapas de trabajo."""
import csv
import io
import json
from datetime import date, datetime, timezone
from uuid import uuid4
from ..domain.workmaps import MEASUREMENTS, MAX_RECORDS, number, validateGeometry, mapMetadata, summarizeRecords


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
        summary = summarizeRecords(records)
        result = dict(metadata, id=uuid4().hex, created_at=datetime.now(timezone.utc).isoformat(),
                      schema_version=1, format=formatName, demo=False, summary=summary,
                      records=records, original_content=payload['content'])
        self.m_repository.save(result)
        return mapMetadata(result)

    def exportDataset(self, mapId, formatName):
        if formatName != 'json':
            raise ValueError('Formato de exportación inválido')
        data = self.getMap(mapId)
        data.pop('original_content')
        return json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8')
