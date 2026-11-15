"""Simulaciones sobre parcelas visibles digitalizadas en Esri World Imagery.

Los contornos siguen bordes agrícolas observados; no son límites catastrales.
Los cultivos y todas las mediciones son supuestos, como en Lote Norte.
"""
import json
from copy import deepcopy
from math import radians, sin
from pathlib import Path

DATES = ('2026-10-29', '2026-11-05', '2026-11-12')
VARIABLES = ('yield_t_ha', 'area_ha', 'moisture_pct', 'speed_kmh', 'elevation_m')


def polygonArea(ring):
    return abs(sum(radians(b[0]-a[0]) * (sin(radians(a[1])) + sin(radians(b[1])))
                   for a, b in zip(ring, ring[1:]))) * 6371008.8**2 / 2 / 10000


BOUNDARIES = json.loads(Path(__file__).with_name('example_fields.geojson').read_text())['features']
PARAMETERS = {'oeste': ('Trigo', (3.2, 3.8, 4.4)), 'sur': ('Cebada', (3.6, 4.2, 4.8)),
              'este': ('Maíz', (7.4, 8.6, 9.8))}
FIELDS = tuple(dict(id=feature['id'], name=feature['properties']['name'],
                    crop=PARAMETERS[feature['id']][0], yields=PARAMETERS[feature['id']][1],
                    area=polygonArea(feature['geometry']['coordinates'][0]),
                    geometry=feature['geometry'], provenance=feature['properties'])
               for feature in BOUNDARIES)


def clipCell(ring, west, south, east, north):
    """Intersección del contorno con una celda rectangular (Sutherland–Hodgman)."""
    points = ring[:-1]
    for axis, bound, direction in ((0, west, 1), (0, east, -1), (1, south, 1), (1, north, -1)):
        if not points:
            break
        result = []
        previous = points[-1]
        previousInside = direction * (previous[axis] - bound) >= 0
        for current in points:
            currentInside = direction * (current[axis] - bound) >= 0
            if currentInside != previousInside:
                ratio = (bound - previous[axis]) / (current[axis] - previous[axis])
                intersection = [previous[i] + ratio * (current[i] - previous[i]) for i in (0, 1)]
                intersection[axis] = bound
                result.append(intersection)
            if currentInside:
                result.append(list(current))
            previous, previousInside = current, currentInside
        points = result
    # Evitar vértices repetidos cuando el límite cae justo en una esquina.
    clean = []
    for point in points:
        if not clean or point != clean[-1]:
            clean.append(point)
    if len(clean) > 1 and clean[0] == clean[-1]:
        clean.pop()
    return clean + [clean[0][:]] if len(clean) >= 3 else []


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
    mean = round(sum(r['yield_t_ha'] for r in records)/len(records), 6)
    weightedMean = round(sum(r['yield_t_ha']*r['area_ha'] for r in records)/totalArea, 6)
    summary = dict(record_count=len(records), area_ha=totalArea, yield_t_ha=weightedMean,
                   yield_mean_t_ha=mean, yield_covered_area_ha=totalArea,
                   missing={key: 0 for key in VARIABLES}, georeferenced_count=len(records),
                   warnings=['Contorno agrícola real aproximado, trazado visualmente sobre Esri World Imagery; no es un límite catastral.',
                             'Cultivo, labor y mediciones son SIMULADOS, no observaciones reales ni estimaciones de IA.',
                             'Cada fecha es una simulación sobre la misma superficie. No sumar hectáreas entre fechas.'])
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
        return deepcopy([{k: v for k, v in data.items() if k not in ('records', 'original_content')}
                         for data in sorted(self.m_maps.values(), key=lambda item: (item['field'], -DATES.index(item['date'])))])

    def getMap(self, mapId):
        return deepcopy(self.m_maps[mapId])
