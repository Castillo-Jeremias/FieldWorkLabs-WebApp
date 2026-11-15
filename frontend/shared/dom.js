/** Creación de nodos de texto sin interpretar contenido como HTML. */
export const byId = id => document.getElementById(id);
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
