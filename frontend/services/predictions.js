/** Cliente de la simulación externa a través del backend. */
import {postJson} from './http.js';
export const simulate = (point, scenario, options) => postJson('/api/predictions', {...point, escenario_clima: scenario}, options);
