import {measurements} from '../datasets/measurements.js';
import {finite} from '../shared/format.js';

export function stats(values) {
  if (!values.length) return null;
  let min = Infinity, max = -Infinity, mean = 0, variance = 0;
  values.forEach((value, i) => { min = Math.min(min, value); max = Math.max(max, value); const delta = value - mean; mean += delta / (i + 1); variance += delta * (value - mean); });
  const bins = Array(min === max ? 1 : 6).fill(0);
  values.forEach(value => bins[min === max ? 0 : Math.min(5, Math.floor((value - min) / (max - min) * 6))]++);
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = fraction => { const index = (sorted.length - 1) * fraction, lower = Math.floor(index); return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower); };
  return {min, max, mean, std: Math.sqrt(variance / values.length), median: quantile(.5), q1: quantile(.25), q3: quantile(.75), bins};
}
export function variables(records) {
  const result = Object.entries(measurements).map(([key, [label, unit]]) => ({key, label, unit, read: row => row[key]}));
  const extra = new Set();
  for (const row of records) for (const [key, value] of Object.entries(row.raw_properties || {})) {
    if (!(key in measurements) && !['latitude', 'longitude', 'row', 'column'].includes(key) && finite(value)) extra.add(key);
  }
  for (const key of extra) result.push({key: `raw:${key}`, label: key, unit: 'unidad no especificada', read: row => row.raw_properties?.[key]});
  return result.filter(variable => records.some(row => finite(variable.read(row))));
}
export function mapNames(maps) {
  const counts = new Map(), used = new Set();
  return maps.map(map => {
    const name = map.filename || map.field || 'Mapa sin nombre';
    let number = (counts.get(name) || 0) + 1;
    let label = number === 1 ? name : `${name} (${number})`;
    while (used.has(label)) { number++; label = `${name} (${number})`; }
    counts.set(name, number); used.add(label);
    return label;
  });
}
