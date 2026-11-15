"""Repositorio de demostración; entrega copias para evitar estado compartido mutable."""
from copy import deepcopy
from typing import Protocol
from .geometry import field_metadata


class ObservationRepository(Protocol):
    def getCatalog(self) -> dict: ...
    def getField(self) -> dict: ...


class DemoObservationRepository:
    def __init__(self):
        self.m_dates = ('2026-11-12', '2026-11-05', '2026-10-29')
        self.m_field = deepcopy(field_metadata())
        self.m_variables = [
            dict(id='precipitation', name='Precipitación acumulada', unit='mm', reason='Identificar eventos de lluvia', period='Acumulado de los 7 días previos', values=[42, 18, 6], limits=[0, 80], digits=1),
            dict(id='soil_moisture', name='Humedad antecedente', unit='%', reason='Evaluar condiciones previas del suelo', period='Promedio de los 7 días previos · humedad volumétrica', values=[32, 26, 21], limits=[10, 50], digits=1),
            dict(id='elevation', name='Elevación y pendiente (SRTM)', unit='m', reason='Identificar zonas bajas y flujo potencial', period='Relieve estático simulado · no proviene de SRTM', values=[124, 124, 124], limits=[110, 138], digits=1, slope=2.4),
            dict(id='evapotranspiration', name='Evapotranspiración', unit='mm/día', reason='Estimar pérdida de agua', period='Promedio diario de los 7 días previos', values=[4.2, 4.7, 5.1], limits=[0, 8], digits=1),
            dict(id='air_temperature', name='Temperatura del aire', unit='°C', reason='Contexto agroclimático', period='Promedio diario', values=[24.5, 26.2, 28.1], limits=[15, 35], digits=1),
            dict(id='NDVI', name='NDVI', unit='', reason='Evaluar respuesta de la vegetación', period='Observación de la fecha seleccionada', values=[.72, .68, .64], limits=[0, 1], digits=2),
            dict(id='surface_temperature', name='Temperatura superficial', unit='°C', reason='Complementar el análisis de estrés', period='Observación de la fecha seleccionada', values=[29.8, 32.1, 35.4], limits=[20, 45], digits=1),
        ]

    def getCatalog(self):
        variables = deepcopy(self.m_variables)
        for priority, variable in enumerate(variables, 1):
            variable['priority'] = priority
        return {'variables': variables, 'dates': list(self.m_dates), 'demo': True}

    def getField(self):
        return deepcopy(self.m_field)
