/** Transporte JSON común: conserva AbortSignal, caché y errores del servidor. */
export async function requestJson(url, options) {
  const response = await fetch(url, options);
  let result;
  try { result = await response.json(); }
  catch { throw Error('La carga de datos no está disponible. Reiniciá el servidor y recargá la página.'); }
  if (!response.ok) throw Error(result.error || 'No se pudo completar la operación');
  return result;
}
export function postJson(url, payload, options = {}) {
  return requestJson(url, {...options, method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
}
