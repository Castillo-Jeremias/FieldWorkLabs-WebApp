"""Simulaciones sobre parcelas visibles digitalizadas en Esri World Imagery.

Los contornos siguen bordes agrícolas observados; no son límites catastrales.
Los cultivos y todas las mediciones son supuestos, como en Lote Norte.
"""
import json
from copy import deepcopy
from ..geometry import polygonArea, clipCell
from ..datasets.workmaps import FIELDS
from ..datasets.observations import OBSERVATION_DATES
from ..domain.workmaps import mapMetadata, summarizeRecords

DATES = tuple(reversed(OBSERVATION_DATES))




def buildExample(field, dateIndex):
    ring = field['geometry']['coordinates'][0]
    west, east = min(p[0] for p in ring), max(p[0] for p in ring)
    south, north = min(p[1] for p in ring), max(p[1] for p in ring)
    rows, columns = 10, 12
    records, features = [], []
    for row in range(rows):
        for col in range(columns):
            clipped = clipCell(ring, west+(east-west)*col/columns, south+(north-south)*row/rows,
                               west+(east-west)*(col+1)/columns, south+(north-south)*(row+1)/rows)
            if not clipped:
                continue
            area = polygonArea(clipped)
            if area < 1e-8:
                continue
            geometry = dict(type='Polygon', coordinates=[clipped])
            offset = (col-(columns-1)/2)*.09 + (row-(rows-1)/2)*.04
            values = dict(yield_t_ha=field['yields'][dateIndex]+offset, area_ha=area,
                          moisture_pct=round(18-dateIndex*1.5+row*.08, 2),
                          speed_kmh=round(4.5+col*.06+dateIndex*.2, 2),
                          elevation_m=round(90+row*.7+col*.2, 2))
            properties = dict(values, synthetic=True, geometry_origin='digitized_imagery', row=row+1, column=col+1)
            records.append(dict(record_id=len(records)+1, **values, geometry=geometry,
                                quality_flags=[], raw_properties=properties))
    totalArea = sum(r['area_ha'] for r in records)
    offsetMean = sum((r['yield_t_ha']-field['yields'][dateIndex])*r['area_ha'] for r in records)/totalArea
    for record in records:
        record['yield_t_ha'] = round(record['yield_t_ha']-offsetMean, 6)
        record['raw_properties']['yield_t_ha'] = record['yield_t_ha']
        features.append(dict(type='Feature', geometry=record['geometry'], properties=record['raw_properties']))
    date = DATES[dateIndex]
    summary = summarizeRecords(records)
    for key in ('yield_t_ha', 'yield_mean_t_ha'):
        summary[key] = round(summary[key], 6)
    summary['warnings'] = [
        'Contorno agrícola real aproximado, trazado visualmente sobre Esri World Imagery; no es un límite catastral.',
        'Cultivo, labor y mediciones son SIMULADOS, no observaciones reales ni estimaciones de IA.',
        'Cada fecha es una simulación sobre la misma superficie. No sumar hectáreas entre fechas.']
    return dict(id=f'example-{field["id"]}-{date}', field=field['name'], crop=field['crop'],
                campaign='2026 · Simulación', date=date, operation='Cosecha simulada',
                source='Contorno: Esri World Imagery · mediciones sintéticas locales',
                filename=f'simulacion-{field["id"]}-{date}.geojson',
                created_at=f'{date}T12:00:00+00:00', schema_version=1, format='geojson', demo=True,
                geometry_origin='digitized_imagery', geometry=field['geometry'],
                boundary_provenance=deepcopy(field['provenance']),
                boundary_source_url=field['provenance']['source_url'],
                location=field['provenance']['location'], summary=summary, records=records,
                original_content=json.dumps(dict(type='FeatureCollection', features=features,
                                                  boundary_provenance=field['provenance'])))


class ExampleWorkMapRepository:
    def __init__(self):
        self.m_maps = {data['id']: data for field in FIELDS
                       for index in range(len(DATES)) for data in [buildExample(field, index)]}

    def listMaps(self):
        return deepcopy([mapMetadata(data)
                         for data in sorted(self.m_maps.values(), key=lambda item: (item['field'], -DATES.index(item['date'])))])

    def getMap(self, mapId):
        return deepcopy(self.m_maps[mapId])
