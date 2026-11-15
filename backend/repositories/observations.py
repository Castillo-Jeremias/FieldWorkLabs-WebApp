"""Repositorio de demostración; entrega copias para evitar estado compartido mutable."""
from copy import deepcopy
from typing import Protocol
from ..geometry import field_metadata
from ..datasets.observations import OBSERVATION_DATES, OBSERVATION_VARIABLES


class ObservationRepository(Protocol):
    def getCatalog(self) -> dict: ...
    def getField(self) -> dict: ...


class DemoObservationRepository:
    def __init__(self):
        self.m_dates = OBSERVATION_DATES
        self.m_field = deepcopy(field_metadata())
        self.m_variables = deepcopy(OBSERVATION_VARIABLES)

    def getCatalog(self):
        variables = deepcopy(self.m_variables)
        for priority, variable in enumerate(variables, 1):
            variable['priority'] = priority
        return {'variables': variables, 'dates': list(self.m_dates), 'demo': True}

    def getField(self):
        return deepcopy(self.m_field)
