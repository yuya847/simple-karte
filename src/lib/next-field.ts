/**
 * On an iPad the on-screen keyboard has no Tab key, and a home-screen app has no 次へ／前へ bar either,
 * so a form lets Enter move to the next field. Attach to a container's onKeyDown.
 */
export function focusNextOnEnter(e: { key: string; shiftKey: boolean; target: EventTarget | null; currentTarget: EventTarget | null; preventDefault: () => void }): void {
  if (e.key !== "Enter") return;
  const t = e.target as HTMLElement | null;
  if (!t || t.tagName !== "INPUT" || (t as HTMLInputElement).type === "checkbox" || (t as HTMLInputElement).type === "radio") return;
  const root = e.currentTarget as HTMLElement | null;
  if (!root) return;
  const fields = [...root.querySelectorAll<HTMLElement>("input, select, textarea")].filter((x) => !(x as HTMLInputElement).disabled && x.tabIndex >= 0 && (x as HTMLInputElement).type !== "hidden");
  const i = fields.indexOf(t);
  if (i < 0) return;
  const next = fields[e.shiftKey ? i - 1 : i + 1];
  if (!next) return;
  e.preventDefault();
  next.focus();
  const sel = (next as HTMLInputElement).select;
  if (next.tagName === "INPUT" && typeof sel === "function") sel.call(next);
}
