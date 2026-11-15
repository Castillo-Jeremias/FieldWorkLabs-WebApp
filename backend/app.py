"""Punto de entrada de FieldWork Labs."""
import argparse

# Permite tanto `python backend/app.py` como `python -m backend.app`.
if __package__ in (None, ''):
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.config import Settings
from backend.server import WebServer
from backend.data import DemoObservationRepository
from backend.services import DemoObservationService
from backend.workmaps import WorkMapRepository, WorkMapService
from backend.example_workmaps import ExampleWorkMapRepository


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default=None)
    parser.add_argument('--port', type=int, default=None)
    parser.add_argument('--frontend-dir', default=None)
    parser.add_argument('--data-dir', default=None)
    args = parser.parse_args(argv)
    try:
        settings = Settings().fromEnv(
            host=args.host, port=args.port, frontendDir=args.frontend_dir, dataDir=args.data_dir,
        )
    except ValueError as exc:
        parser.error(str(exc))
    service = DemoObservationService(DemoObservationRepository())
    workMaps = WorkMapService(WorkMapRepository(settings.m_dataDir / 'workmaps.sqlite3'),
                              examples=ExampleWorkMapRepository())
    WebServer(settings, service, workMaps=workMaps).run()


if __name__ == '__main__':
    main()
