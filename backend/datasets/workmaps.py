"""Contornos y parámetros de los mapas sintéticos de ejemplo."""
import json
from . import DATASET_DIR
from ..geometry import polygonArea

BOUNDARIES = json.loads((DATASET_DIR / 'example_fields.geojson').read_text())['features']
PARAMETERS = {'oeste': ('Trigo', (3.2, 3.8, 4.4)), 'sur': ('Cebada', (3.6, 4.2, 4.8)),
              'este': ('Maíz', (7.4, 8.6, 9.8))}
FIELDS = tuple(dict(id=feature['id'], name=feature['properties']['name'],
                    crop=PARAMETERS[feature['id']][0], yields=PARAMETERS[feature['id']][1],
                    area=polygonArea(feature['geometry']['coordinates'][0]),
                    geometry=feature['geometry'], provenance=feature['properties'])
               for feature in BOUNDARIES)

