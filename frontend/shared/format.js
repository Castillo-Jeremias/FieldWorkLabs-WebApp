/** Convenciones de presentación utilizadas por las vistas. */
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const formatNumber = (value, digits = 2) => value.toLocaleString('es-AR', {minimumFractionDigits: digits, maximumFractionDigits: digits});
export const formatMeasurement = value => finite(value) ? value.toLocaleString('es-AR', {maximumFractionDigits: 2}) : 'Sin dato';
export const dateText = date => new Date(date + 'T12:00:00').toLocaleDateString('es-AR', {day:'numeric', month:'short', year:'numeric'});
