import {simulate} from '../services/predictions.js';
import {simulationSession} from '../domain/predictions.js';

export const Predictions = (() => {
  let generation = 0, cleanupDownload;
  const draft = simulationSession.draft;
  function unmount() { generation++; cleanupDownload?.(); cleanupDownload = null; }
  async function mount(container) {
    unmount();
    const current = generation;
    container.innerHTML = `
      <div class="prediction-workspace">
        <div class="prediction-banner"><span class="demo-tag">SIMULACIÓN EXTERNA</span><p>Consultá la API de simulación con el punto geográfico cargado y el escenario climático.</p></div>
        <div class="collection-grid prediction-grid">
          <form class="view-card collection-form" id="prediction-form">
            <div class="prediction-configuration">
              <div class="prediction-section-heading"><span>01</span><div><h2>Ubicación para el análisis</h2><p>Cargá el punto geográfico que se utilizará en el reporte.</p></div></div>
              <p class="prediction-help">La determinación del punto de referencia a partir del mapa de trabajo queda pendiente para una etapa futura.</p>
              <div class="prediction-coordinates">
                <label>Longitud (WGS84)<input name="longitude" type="number" min="-180" max="180" step="any" placeholder="-61.160000" required></label>
                <label>Latitud (WGS84)<input name="latitude" type="number" min="-90" max="90" step="any" placeholder="-33.040000" required></label>
              </div>
              <label>Escenario climático<select name="scenario" required><option value="habitual">Habitual</option><option value="neutro">Neutro</option></select></label>
            </div>
            <div class="prediction-form-footer">
              <div class="collection-actions"><button type="submit">Simular</button></div>
              <p id="prediction-status" role="status" aria-live="polite"></p>
            </div>
          </form>

        </div>
      </div>`;
    const form = container.querySelector('form');
    const longitude = form.elements.longitude;
    const latitude = form.elements.latitude;
    const scenario = form.elements.scenario;
    const controller = new AbortController();
    const status = container.querySelector('#prediction-status');
    const button = form.querySelector('[type=submit]');
    Object.entries(draft).forEach(([name, value]) => { form.elements[name].value = value; });
    cleanupDownload = () => controller.abort();
    form.addEventListener('input', () => {
      Object.keys(draft).forEach(name => { draft[name] = form.elements[name].value; });
      status.textContent = '';
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled || !form.reportValidity()) return;
      const point = {lon: Number(longitude.value), lat: Number(latitude.value)};
      button.disabled = true; button.textContent = 'Simulando…'; scenario.disabled = true; longitude.disabled = true; latitude.disabled = true;
      status.textContent = 'Consultando la API de simulación…';
      try {
        const payload = await simulate(point, scenario.value.trim(), {signal: controller.signal});
        if (current !== generation) return;
        simulationSession.current = {point, scenario: scenario.value, result: payload.result};
        window.location.hash = 'reportes';
      } catch (error) {
        if (current !== generation || error.name === 'AbortError') return;
        status.textContent = error.message || 'No se pudo ejecutar la simulación.';
      } finally {
        if (current === generation) {
          button.disabled = false; button.textContent = 'Simular'; scenario.disabled = false; longitude.disabled = false; latitude.disabled = false;
        }
      }
    });

  }
  return {mount, unmount};
})();
