"""Persistencia SQLite de mapas importados."""
import json
import sqlite3
from pathlib import Path
from ..domain.workmaps import mapMetadata


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
        return [mapMetadata(json.loads(row[0])) for row in rows]

    def getMap(self, mapId):
        with self.connect() as connection:
            row = connection.execute('SELECT payload FROM work_maps WHERE id = ?', (mapId,)).fetchone()
        if row is None:
            raise KeyError(mapId)
        return json.loads(row[0])

