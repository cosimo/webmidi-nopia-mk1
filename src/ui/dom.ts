type Handler = (e: Event) => void;
export type Attrs = Record<string, string | number | boolean | Handler | undefined>;

/** Create an element: attributes, `on<event>` listeners, then children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...children);
  return el;
}

/** A <select> whose options can be replaced; `onChange` gets the chosen value. */
export function createSelect(attrs: Attrs, onChange: (value: string) => void) {
  const el = h('select', { ...attrs, onchange: () => onChange(el.value) });
  let current = '';
  return {
    el,
    /** Rebuilds the options only when they changed, so an open dropdown is not disturbed. */
    setOptions(options: { value: string; label: string }[], selected: string) {
      const next = JSON.stringify(options);
      if (next !== current) {
        el.replaceChildren(...options.map((o) => h('option', { value: o.value }, o.label)));
        current = next;
      }
      el.value = selected;
    },
  };
}
