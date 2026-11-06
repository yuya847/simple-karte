import { afterEach, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({ canvas: null as unknown, effects: [] as (() => void | (() => void))[] }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (value: unknown) => ({ current: value === null ? browser.canvas : value }),
  useEffect: (effect: () => void | (() => void)) => { browser.effects.push(effect); },
}));
import { MonitorCanvas } from "./MonitorCanvas";

afterEach(() => { vi.unstubAllGlobals(); browser.effects = []; });
it("開いた時もリサイズ時も表示幅の端まで波形を描く", () => {
  const ctx = { setTransform: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() };
  const canvas = { clientWidth: 960, width: 0, height: 0, getContext: () => ctx };
  browser.canvas = canvas;
  let resize = () => {};
  vi.stubGlobal("window", { devicePixelRatio: 2, requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn() });
  vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  MonitorCanvas({ traces: [{ kind: "ecg", rate: 72, color: "green", label: "II" }] });
  const cleanups = browser.effects.map(effect => effect());
  expect(canvas.width).toBe(1920);
  expect(ctx.lineTo.mock.calls.at(-1)?.[0]).toBe(960);
  expect(ctx.lineTo.mock.calls.every(([, y]) => Number.isFinite(y))).toBe(true);
  canvas.clientWidth = 1240;
  resize();
  expect(canvas.width).toBe(2480);
  expect(ctx.lineTo.mock.calls.at(-1)?.[0]).toBe(1240);
  cleanups.forEach(cleanup => cleanup?.());
});
