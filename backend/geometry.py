"""Geometría común para estadísticas, contorno y raster de la demostración."""
import json
from math import radians, sin, log, tan, pi
from .datasets import DATASET_DIR

def polygonArea(ring):
    """Superficie esférica de un anillo cerrado, en hectáreas."""
    return abs(sum(radians(b[0]-a[0]) * (sin(radians(a[1])) + sin(radians(b[1])))
                   for a, b in zip(ring, ring[1:]))) * 6371008.8**2 / 2 / 10000


FEATURE = json.loads((DATASET_DIR / 'demo_field.geojson').read_text())
RING = FEATURE['geometry']['coordinates'][0]
WEST, EAST = min(p[0] for p in RING), max(p[0] for p in RING)
SOUTH, NORTH = min(p[1] for p in RING), max(p[1] for p in RING)
PAD_X, PAD_Y = (EAST-WEST)*.15, (NORTH-SOUTH)*.15
BOUNDS = [[SOUTH-PAD_Y, WEST-PAD_X], [NORTH+PAD_Y, EAST+PAD_X]]


def mercator(latitude):
    return log(tan(pi/4+radians(latitude)/2))


def normalize(longitude, latitude):
    south, west = BOUNDS[0]
    north, east = BOUNDS[1]
    return ((longitude-west)/(east-west),
            (mercator(north)-mercator(latitude))/(mercator(north)-mercator(south)))


POLYGON = tuple(normalize(lon, lat) for lon, lat in RING[:-1])
# Superficie esférica del contorno digitalizado, expresada en hectáreas.
AREA_HA = round(polygonArea(RING), 2)


def field_metadata():
    return dict(field=FEATURE['properties']['name'], area=AREA_HA, crop='Maíz', demo=True,
                location=FEATURE['properties']['location'],
                center=dict(latitude=(NORTH+SOUTH)/2, longitude=(WEST+EAST)/2),
                geometry=FEATURE['geometry'], bounds=BOUNDS,
                normalized_polygon=POLYGON, provenance=FEATURE['properties'])


def work_map_metadata(dataset):
    """Contexto geográfico del trabajo; entrada común para proveedores de observaciones."""
    polygons = []
    geometries = ([dataset['geometry']] if dataset.get('geometry') else
                  [record['geometry'] for record in dataset['records'] if record.get('geometry')])
    for geometry in geometries:
        if geometry['type'] == 'Polygon':
            polygons.append(geometry['coordinates'])
        elif geometry['type'] == 'MultiPolygon':
            polygons.extend(geometry['coordinates'])
    if not polygons:
        raise ValueError('La simulación requiere una delimitación Polygon o MultiPolygon; los puntos no definen una superficie')
    points = [point for polygon in polygons for ring in polygon for point in ring]
    west, east = min(p[0] for p in points), max(p[0] for p in points)
    south, north = min(p[1] for p in points), max(p[1] for p in points)
    if east <= west or north <= south or south <= -90 or north >= 90:
        raise ValueError('La delimitación debe tener superficie y estar dentro de los límites de Mercator')
    dx, dy = (east-west)*.15, (north-south)*.15
    bounds = [[max(-89.999, south-dy), west-dx], [min(89.999, north+dy), east+dx]]
    def normalized(point):
        return [(point[0]-bounds[0][1])/(bounds[1][1]-bounds[0][1]),
                (mercator(bounds[1][0])-mercator(point[1])) /
                (mercator(bounds[1][0])-mercator(bounds[0][0]))]
    return dict(field=dataset['field'], crop=dataset['crop'], demo=True,
                area=sum(polygonArea(poly[0])-sum(polygonArea(hole) for hole in poly[1:]) for poly in polygons),
                geometry=dict(type='MultiPolygon', coordinates=polygons), bounds=bounds,
                normalized_polygons=[[[normalized(point) for point in ring] for ring in poly] for poly in polygons],
                center=dict(latitude=(south+north)/2, longitude=(west+east)/2),
                location=dataset.get('location', f'{(south+north)/2:.6f}, {(west+east)/2:.6f}'),
                source='Simulación local · valores sintéticos, no obtenidos de ArcGIS')


def work_map_center_geojson(dataset):
    """Punto medio de los límites del mapa en WGS84, sin mediciones."""
    geometries = ([dataset['geometry']] if dataset.get('geometry') else
                  [record['geometry'] for record in dataset.get('records', [])
                   if record.get('geometry')])
    points = []
    for geometry in geometries:
        kind, coordinates = geometry['type'], geometry['coordinates']
        if kind == 'Point':
            points.append(coordinates)
        elif kind == 'Polygon':
            points.extend(point for ring in coordinates for point in ring)
        elif kind == 'MultiPolygon':
            points.extend(point for polygon in coordinates for ring in polygon for point in ring)
    if not points:
        raise ValueError('El mapa no contiene geometría para calcular su punto medio')
    west, east = min(p[0] for p in points), max(p[0] for p in points)
    south, north = min(p[1] for p in points), max(p[1] for p in points)
    return dict(type='Feature', properties={}, geometry=dict(
        type='Point', coordinates=[(west + east) / 2, (south + north) / 2]))


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
