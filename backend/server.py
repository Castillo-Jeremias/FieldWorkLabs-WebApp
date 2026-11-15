"""Adaptador HTTP y ciclo de vida; el dominio se inyecta."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .config import DEFAULT_FRONTEND_DIR, Settings
from .services import ObservationService
from .services.predictions import PredictionService, PredictionError
from .geometry import work_map_metadata, work_map_center_geojson


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, service: ObservationService,
                 frontendDir=DEFAULT_FRONTEND_DIR, workMaps=None, predictions=None, **kwargs):
        self.m_service = service
        self.m_workMaps = workMaps
        self.m_predictions = predictions
        super().__init__(*args, directory=str(frontendDir), **kwargs)

    def do_GET(self):
        # Nombre requerido por BaseHTTPRequestHandler.
        self.handleGet()

    def handleGet(self):
        url = urlparse(self.path)
        if url.path == '/api/work-maps' or url.path.startswith('/api/work-maps/'):
            return self.handleWorkMapGet(url)
        if url.path not in ('/api/summary', '/api/variables'):
            if url.path.startswith('/api/'):
                self.send_error(404)
                return
            return super().do_GET()
        params = parse_qs(url.query)
        try:
            if url.path == '/api/variables':
                data = self.m_service.getCatalog()
            else:
                date = params.get('date', [self.m_service.getCatalog()['dates'][0]])[0]
                if 'variable' in params:
                    data = self.m_service.getVariableSummary(date, params['variable'][0])
                else:
                    data = self.m_service.getIndexSummary(date, params.get('index', ['NDVI'])[0])
        except ValueError as exc:
            self.send_error(400, str(exc))
            return
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def sendBody(self, status, body, contentType='application/json; charset=utf-8', filename=None):
        self.send_response(status)
        self.send_header('Content-Type', contentType)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        if filename:
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(body)

    def sendJson(self, status, data):
        self.sendBody(status, json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def handleWorkMapGet(self, url):
        if self.m_workMaps is None:
            return self.sendJson(503, {'error': 'Recopilación no configurada'})
        parts = url.path.strip('/').split('/')
        try:
            if len(parts) == 2:
                return self.sendJson(200, {'maps': self.m_workMaps.listMaps()})
            mapId = parts[2]
            if len(parts) == 4 and parts[3] == 'observations':
                dataset = self.m_workMaps.getMap(mapId)
                params = parse_qs(url.query)
                data = self.m_service.getVariableSummary(
                    dataset['date'], params.get('variable', ['NDVI'])[0], work_map_metadata(dataset))
                return self.sendJson(200, data)
            if len(parts) == 4 and parts[3] == 'center':
                return self.sendJson(200, work_map_center_geojson(self.m_workMaps.getMap(mapId)))
            if len(parts) == 4 and parts[3] == 'export':
                formatName = parse_qs(url.query).get('format', ['json'])[0]
                body = self.m_workMaps.exportDataset(mapId, formatName)
                contentType = 'application/json; charset=utf-8'
                return self.sendBody(200, body, contentType, f'work-map-{mapId}.{formatName}')
            if len(parts) == 3:
                data = self.m_workMaps.getMap(mapId)
                data.pop('original_content')
                return self.sendJson(200, data)
            return self.sendJson(404, {'error': 'Ruta no encontrada'})
        except KeyError:
            return self.sendJson(404, {'error': 'Mapa no encontrado'})
        except ValueError as exc:
            return self.sendJson(400, {'error': str(exc)})

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ('/api/work-maps', '/api/predictions'):
            return self.sendJson(404, {'error': 'Ruta no encontrada'})
        if path == '/api/work-maps' and self.m_workMaps is None:
            return self.sendJson(503, {'error': 'Recopilación no configurada'})
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            return self.sendJson(415, {'error': 'Usar application/json'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 10 * 1024 * 1024:
                return self.sendJson(413, {'error': 'El cuerpo debe ocupar entre 1 byte y 10 MiB'})
            payload = json.loads(self.rfile.read(length))
            if path == '/api/predictions':
                if self.m_predictions is None:
                    return self.sendJson(503, {'error': 'API de simulación no configurada'})
                if not isinstance(payload, dict):
                    raise ValueError('Se requiere un punto geográfico con lat y lon')
                result = self.m_predictions.simulate(payload, payload.get('escenario_clima', 'habitual'))
                return self.sendJson(200, {'result': result})
            result = self.m_workMaps.importMap(payload)
        except PredictionError as exc:
            return self.sendJson(exc.status, {'error': str(exc)})
        except KeyError:
            return self.sendJson(404, {'error': 'Mapa no encontrado'})
        except (ValueError, UnicodeError, RecursionError) as exc:
            return self.sendJson(400, {'error': str(exc)})
        self.sendJson(201, result)


class WebServer:
    def __init__(self, settings: Settings, service: ObservationService, workMaps=None):
        self.m_settings = settings
        self.m_service = service
        self.m_workMaps = workMaps

    def createHttpServer(self):
        handler = partial(Handler, frontendDir=self.m_settings.m_frontendDir,
                          service=self.m_service, workMaps=self.m_workMaps,
                          predictions=PredictionService(self.m_settings.m_predictionUrl))
        return ThreadingHTTPServer((self.m_settings.m_host, self.m_settings.m_port), handler)

    def run(self):
        with self.createHttpServer() as server:
            host, port = server.server_address[:2]
            print(f'FieldWork Labs: http://{host}:{port}', flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
