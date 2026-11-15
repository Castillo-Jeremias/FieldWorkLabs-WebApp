"""Cliente de la API externa de simulación."""
import json
import math
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen



class PredictionError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


class PredictionService:
    def __init__(self, url, timeout=60):
        self.url = url
        self.timeout = timeout

    def simulate(self, point, scenario):
        if not isinstance(scenario, str) or not scenario.strip() or len(scenario) > 100:
            raise ValueError('El escenario climático debe ser un texto de entre 1 y 100 caracteres')
        if not isinstance(point, dict):
            raise ValueError('Se requiere un punto geográfico con lat y lon')
        lat, lon = point.get('lat'), point.get('lon')
        for value, limit, name in ((lat, 90, 'lat'), (lon, 180, 'lon')):
            if (isinstance(value, bool) or not isinstance(value, (int, float))
                    or not math.isfinite(value) or not -limit <= value <= limit):
                raise ValueError(f'{name} debe ser un número entre {-limit} y {limit}')
        payload = dict(lat=lat, lon=lon, escenario_clima=scenario.strip())
        request = Request(self.url, data=json.dumps(payload).encode('utf-8'),
                          headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
                          method='POST')
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read())
        except HTTPError as exc:
            raise PredictionError(f'La API de simulación devolvió HTTP {exc.code}') from exc
        except (TimeoutError, URLError) as exc:
            raise PredictionError('No se pudo conectar con la API de simulación o se agotó el tiempo de espera', 504) from exc
        except (ValueError, UnicodeError) as exc:
            raise PredictionError('La API de simulación no devolvió un JSON válido') from exc
