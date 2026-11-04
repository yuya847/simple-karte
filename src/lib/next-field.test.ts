import { describe, expect, it } from "vitest";
import { focusNextOnEnter } from "./next-field";

// Small stand-ins for form fields (no DOM in these tests): what the helper reads and calls.
function field(id: string, tagName: string, opts: { disabled?: boolean; type?: string } = {}) {
  return { id, tagName, disabled: !!opts.disabled, tabIndex: 0, type: opts.type ?? "text", focused: false, selected: false, focus() { this.focused = true; }, select() { this.selected = true; } };
}

describe("Enter moves to the next field (iPad has no Tab)", () => {
  const a = field("a", "INPUT");
  const b = field("b", "INPUT", { disabled: true });
  const c = field("c", "SELECT");
  const d = field("d", "INPUT");
  const root = { querySelectorAll: () => [a, b, c, d] };
  let prevented = 0;
  const ev = (key: string, target: unknown, shiftKey = false) => ({ key, shiftKey, target: target as EventTarget, currentTarget: root as unknown as EventTarget, preventDefault: () => prevented++ });

  it("skips a disabled field and lands on the next one, selecting an input's text", () => {
    focusNextOnEnter(ev("Enter", a));
    expect(c.focused).toBe(true);
    expect(prevented).toBe(1);
    focusNextOnEnter(ev("Enter", c));
    expect(d.focused).toBe(false); // Enter in a select chooses an option; the helper leaves it alone
  });
  it("Shift+Enter goes back; other keys and the last field are left alone", () => {
    focusNextOnEnter(ev("Enter", d, true));
    expect(c.focused).toBe(true);
    focusNextOnEnter(ev("Tab", a));
    focusNextOnEnter(ev("Enter", d));
    expect(prevented).toBe(2);
    expect(d.selected).toBe(false);
  });
});
