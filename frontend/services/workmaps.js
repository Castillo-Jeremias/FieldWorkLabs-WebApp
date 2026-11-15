/** Acceso al catálogo, registros y observaciones de mapas de trabajo. */
import {requestJson, postJson} from './http.js';
const mapUrl = id => `/api/work-maps/${encodeURIComponent(id)}`;
export const listMaps = options => requestJson('/api/work-maps', options);
export const getMap = (id, options) => requestJson(mapUrl(id), options);
export const importMap = payload => postJson('/api/work-maps', payload);
export const getObservations = (id, variable, options) => requestJson(`${mapUrl(id)}/observations?variable=${encodeURIComponent(variable)}`, options);
