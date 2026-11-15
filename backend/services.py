"""Consultas y cálculos del dominio, sin dependencias HTTP ni de exportación."""
from typing import Protocol
from .data import ObservationRepository
from .simulation import simulate


class ObservationService(Protocol):
    def getCatalog(self) -> dict: ...
    def getVariableSummary(self, date: str, variableId: str, field=None) -> dict: ...
    def getIndexSummary(self, date: str, index: str) -> dict: ...


class DemoObservationService:
    m_zoneNames = ('Alto', 'Medio', 'Bajo', 'Muy bajo')
    m_zoneColors = ('#83cb4e', '#f4d34f', '#fa9d32', '#ef6254')
    m_indexOffsets = {'NDVI': 0, 'NDRE': -0.12, 'SAVI': -0.06}

    def __init__(self, repository: ObservationRepository):
        self.m_repository = repository

    def getCatalog(self):
        return self.m_repository.getCatalog()

    def getDatePosition(self, date):
        try:
            return self.getCatalog()['dates'].index(date)
        except ValueError as exc:
            raise ValueError('Fecha no disponible') from exc

    def buildSummary(self, date, index, metrics, percentages, ranges, field=None):
        field = field or self.m_repository.getField()
        zones = [dict(name=name, range=limits, percent=percent,
                      area=round(field['area'] * percent / 100, 2), color=color)
                 for name, limits, percent, color in zip(
                     self.m_zoneNames, ranges, percentages, self.m_zoneColors)]
        largest = max(range(len(zones)), key=lambda i: zones[i]['percent'])
        zones[largest]['area'] = round(field['area']-sum(
            zone['area'] for i, zone in enumerate(zones) if i != largest), 2)
        return dict(field, date=date, index=index, zones=zones, **metrics)

    def getVariableSummary(self, date, variableId, field=None):
        position = self.getDatePosition(date) if field is None or date in self.getCatalog()['dates'] else 0
        variable = next((v for v in self.getCatalog()['variables'] if v['id'] == variableId), None)
        if variable is None:
            raise ValueError('Variable no disponible')
        low, high = variable['limits']
        bounds = [high, low + (high-low)*.66, low + (high-low)*.4, low + (high-low)*.2, low]
        metrics, percentages = simulate(variable, position, field)
        metrics['variable'] = variable
        ranges = [f'{bounds[i+1]:.2f} – {bounds[i]:.2f}' for i in range(4)]
        return self.buildSummary(date, variableId, metrics, percentages, ranges, field)

    def getIndexSummary(self, date, index):
        position = self.getDatePosition(date)
        if index not in self.m_indexOffsets:
            raise ValueError('Índice no disponible')
        offset = position * .04 + self.m_indexOffsets[index]
        percentages = [round(43.6-offset*100, 1), 36.8, round(15.4+offset*70, 1)]
        percentages.append(round(100-sum(percentages), 1))
        metrics = dict(average=round(.72-offset, 2), min=round(.19-offset/2, 2),
                       max=round(.92-offset/2, 2), std=.15)
        return self.buildSummary(date, index, metrics, percentages,
                                 ['0,66 – 1,00', '0,40 – 0,66', '0,20 – 0,40', '0,00 – 0,20'])
