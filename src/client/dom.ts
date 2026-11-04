type Child = Node | string | null | false | undefined;
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

/** Creates an element. `on...` attributes are event handlers, `--x` attributes are CSS variables. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k.startsWith("--")) el.style.setProperty(k, String(v));
    else if (k === "class") el.className = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c) el.append(c);
  return el;
}
