/** QT in ms, RR in seconds. ESC: How to measure the QT interval (2024). */
export function physioCalculated(test: string, v: Record<string, number>): Record<string, number> {
  const round = (n: number) => Math.round(n * 10) / 10;
  if (test === "PHY-ECG" && Number.isFinite(v.HR) && v.HR > 0 && Number.isFinite(v.QT) && v.QT > 0) {
    const rr = 60 / v.HR;
    return { QTc: Math.round(v.QT / Math.sqrt(rr)), QTcF: Math.round(v.QT / Math.cbrt(rr)) };
  }
  if (test === "PHY-UCG" && Number.isFinite(v.LVDd) && Number.isFinite(v.LVDs) && v.LVDd > 0 && v.LVDs > 0 && v.LVDs < v.LVDd) {
    // DICOM CP-756: V = 7D³/(2.4+D), D in cm, V in mL.
    const volume = (mm: number) => 7 * (mm / 10) ** 3 / (2.4 + mm / 10);
    const edv = volume(v.LVDd);
    return { FS: round((v.LVDd - v.LVDs) / v.LVDd * 100), LVEF: round((edv - volume(v.LVDs)) / edv * 100) };
  }
  return {};
}

/** Manual overrides survive changes to source measurements; clearing restores automatic entry. */
export function physioWithCalculated(test: string, raw: Record<string, string>, manual: ReadonlySet<string>): Record<string, string> {
  const measured = Object.fromEntries(Object.entries(raw).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)]));
  const result = { ...raw };
  const keys = test === "PHY-ECG" ? ["QTc", "QTcF"] : test === "PHY-UCG" ? ["FS", "LVEF"] : [];
  const calculated = physioCalculated(test, measured);
  for (const key of keys) if (!manual.has(key)) result[key] = calculated[key] === undefined ? "" : String(calculated[key]);
  return result;
}
