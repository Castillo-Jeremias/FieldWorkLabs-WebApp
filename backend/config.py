"""Configuración externa del proceso; no abre conexiones ni inicia servidores."""
import os
from pathlib import Path
from typing import Mapping, Optional

DEFAULT_FRONTEND_DIR = Path(__file__).resolve().parents[1] / 'frontend'


class Settings(object):
    m_host: str = '127.0.0.1'
    m_port: int = 8000
    m_frontendDir: Path = DEFAULT_FRONTEND_DIR
    m_dataDir: Path = Path(__file__).resolve().parents[1] / 'storage'

    def __init__(self, m_host: str = m_host, m_port: int = m_port,
                 m_frontendDir: Path = m_frontendDir, m_dataDir: Path = m_dataDir,
                 m_predictionUrl: str = 'http://localhost:8001/api/v1/simular'):
        if not m_host.strip():
            raise ValueError('El host no puede estar vacío')
        if not 0 <= m_port <= 65535:
            raise ValueError('El puerto debe estar entre 0 y 65535')
        directory = Path(m_frontendDir).expanduser().resolve()
        if not directory.is_dir():
            raise ValueError(f'No existe el directorio del frontend: {directory}')
        if not m_predictionUrl.startswith(('http://', 'https://')):
            raise ValueError('La URL de simulación debe usar HTTP o HTTPS')
        self.m_predictionUrl = m_predictionUrl
        self.m_host = m_host
        self.m_port = m_port
        self.m_frontendDir = directory
        self.m_dataDir = Path(m_dataDir).expanduser().resolve()

    def fromEnv(self, environ: Optional[Mapping[str, str]] = None, **overrides):
        env = os.environ if environ is None else environ
        values = {
            'm_predictionUrl': env.get('FIELDWORK_PREDICTION_URL', self.m_predictionUrl),
            'm_host': env.get('FIELDWORK_HOST', '127.0.0.1'),
            'm_port': env.get('FIELDWORK_PORT', '8000'),
            'm_frontendDir': env.get('FIELDWORK_FRONTEND_DIR', str(DEFAULT_FRONTEND_DIR)),
            'm_dataDir': env.get('FIELDWORK_DATA_DIR', str(self.m_dataDir)),
        }
        values.update({'m_' + key: value for key, value in overrides.items() if value is not None})
        try:
            values['m_port'] = int(values['m_port'])
        except (TypeError, ValueError) as exc:
            raise ValueError('El puerto debe ser un número entero') from exc
        return type(self)(**values)
