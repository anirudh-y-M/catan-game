// Tiny hyperscript helper for building HTML elements.
export function h(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'on') for (const [evt, fn] of Object.entries(v)) node.addEventListener(evt, fn);
    else if (k === 'dataset') for (const [d, dv] of Object.entries(v)) node.dataset[d] = dv;
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v);
  }
  const list = Array.isArray(kids) ? kids : [kids];
  for (const kid of list) {
    if (kid == null || kid === false) continue;
    node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return node;
}

export function clear(node) { node.replaceChildren(); return node; }
