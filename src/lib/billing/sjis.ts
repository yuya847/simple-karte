// Shift_JIS encoding for the receipt file (記録条件仕様: JIS X 0201 の8単位符号と JIS X 0208 附属書1).
// The table is built once from the platform's own Shift_JIS decoder, limited to JIS X 0208 rows
// (lead bytes 81–9F, E0–EF), so vendor extensions such as NEC 特殊文字 (87xx) or IBM 拡張 (ED–EE, FA–FC)
// never reach the file.

let table: Map<string, number[]> | null = null;

function build(): Map<string, number[]> {
  const dec = new TextDecoder("shift_jis", { fatal: true });
  const map = new Map<string, number[]>();
  for (let b = 0x20; b <= 0x7e; b++) map.set(String.fromCharCode(b), [b]);
  for (let b = 0xa1; b <= 0xdf; b++) map.set(dec.decode(new Uint8Array([b])), [b]);
  const leads = [...range(0x81, 0x86), ...range(0x88, 0x9f), ...range(0xe0, 0xea)];
  for (const lead of leads) {
    for (const trail of [...range(0x40, 0x7e), ...range(0x80, 0xfc)]) {
      let ch: string;
      try {
        ch = dec.decode(new Uint8Array([lead, trail]));
      } catch {
        continue;
      }
      if (ch.length === 1 && ch !== "�" && !map.has(ch)) map.set(ch, [lead, trail]);
    }
  }
  return map;
}

function* range(from: number, to: number) {
  for (let i = from; i <= to; i++) yield i;
}

/** Characters of `text` that cannot be written in the receipt file. */
export function unencodable(text: string): string[] {
  table ??= build();
  const bad = new Set<string>();
  for (const ch of text) if (ch !== "\r" && ch !== "\n" && !table.has(ch)) bad.add(ch);
  return [...bad];
}

export function encodeSjis(text: string): Uint8Array {
  table ??= build();
  const out: number[] = [];
  for (const ch of text) {
    if (ch === "\r") out.push(0x0d);
    else if (ch === "\n") out.push(0x0a);
    else {
      const bytes = table.get(ch);
      if (!bytes) throw new Error(`シフトJISにない文字です：${ch}`);
      out.push(...bytes);
    }
  }
  return new Uint8Array(out);
}

/** Bytes of one field in Shift_JIS (全角 = 2, 半角 = 1). */
export function sjisLength(text: string): number {
  table ??= build();
  let n = 0;
  for (const ch of text) n += table.get(ch)?.length ?? 2;
  return n;
}
