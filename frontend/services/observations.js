/** Catálogo ambiental y resúmenes del lote de demostración. */
import {requestJson} from './http.js';
export const getCatalog = options => requestJson('/api/variables', options);
export const getSummary = (date, variable, options) => requestJson(`/api/summary?date=${encodeURIComponent(date)}&variable=${encodeURIComponent(variable)}`, options);
