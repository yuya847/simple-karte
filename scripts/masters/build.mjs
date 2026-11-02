#!/usr/bin/env node
// Build the billing data from the OFFICIAL master files.
//
// Sources (downloaded at build time, never committed to this repository):
//   - 厚生労働省「診療報酬情報提供サービス」基本マスター https://shinryohoshu.mhlw.go.jp/
//   - 社会保険診療報酬支払基金（医療情報基盤・診療報酬審査支払機構）医科電子点数表 https://www.hpdx.or.jp/
//
// Downloads are cached in .cache/masters (or $MASTER_CACHE). Set MASTER_LOCAL to a folder
// that already holds the zips (same file names as CACHE_NAMES below) to build offline.
// Output: src/data/generated/*.json (git-ignored).

import { mkdir, readFile, writeFile, access, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const cacheDir = process.env.MASTER_CACHE ?? join(root, ".cache", "masters");
const outDir = join(root, "src", "data", "generated");

const MHLW = "https://shinryohoshu.mhlw.go.jp/shinryohoshu/downloadMenu";
export const SOURCES = [
  { key: "s", url: `${MHLW}/sFile`, label: "医科診療行為マスター" },
  { key: "y", url: `${MHLW}/yFile`, label: "医薬品マスター" },
  { key: "t", url: `${MHLW}/tFile`, label: "特定器材マスター" },
  { key: "c", url: `${MHLW}/cFile`, label: "コメントマスター" },
  { key: "b", url: `${MHLW}/bFile`, label: "傷病名マスター" },
  { key: "z", url: `${MHLW}/zFile`, label: "修飾語マスター" },
  {
    key: "tensuhyo",
    url: "https://www.hpdx.or.jp/seikyushiharai/tensuhyo/ikashika/index.files/tensuhyo_02.zip",
    label: "医科電子点数表",
  },
];

const exists = (p) =>
  access(p)
    .then(() => true)
    .catch(() => false);

async function getZip(src) {
  await mkdir(cacheDir, { recursive: true });
  const cached = join(cacheDir, `${src.key}.zip`);
  if (await exists(cached)) return readFile(cached);
  const local = process.env.MASTER_LOCAL && join(process.env.MASTER_LOCAL, `${src.key}.zip`);
  if (local && (await exists(local))) {
    await copyFile(local, cached);
    return readFile(cached);
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(src.url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(cached, buf);
      console.log(`downloaded ${src.label} (${(buf.length / 1024).toFixed(0)} KB)`);
      return buf;
    } catch (e) {
      console.warn(`download failed (${src.label}, try ${attempt}): ${e.message}`);
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const sjis = new TextDecoder("shift_jis");

/** Files inside a zip, with CP932 file names decoded. */
function unzip(buf) {
  const files = unzipSync(new Uint8Array(buf));
  return Object.entries(files).map(([rawName, data]) => {
    // fflate reads names as latin1 when the UTF-8 flag is off; turn them back into bytes.
    const name = sjis.decode(Uint8Array.from(rawName, (c) => c.charCodeAt(0) & 0xff));
    return { name, text: () => sjis.decode(data) };
  });
}

/** CSV with "quoted" fields (quotes doubled inside). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Keep the listed 1-based columns, in the given order. */
const pick = (rows, cols) => rows.map((r) => cols.map((c) => r[c - 1] ?? ""));

// Column selections (1-based, per the official file layout R08rec3).
export const COLS = {
  // 医科診療行為マスター
  s: [
    3, 5, 8, 10, 11, 12, 13, 14, 15, 16, 18, 19, 22, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45,
    48, 50, 51, 52, 62, 63, 66, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96,
    97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 113, 117, 128, 132, 133,
  ],
  // 医薬品マスター
  y: [3, 5, 8, 10, 11, 12, 14, 16, 17, 21, 22, 28, 30, 31, 32, 35, 37, 38],
  // 特定器材マスター
  t: [3, 5, 8, 10, 11, 12, 21, 22, 28, 30],
  // 傷病名マスター
  b: [3, 4, 6, 8, 10, 11, 12, 13, 16, 17, 19, 20, 21, 22, 24],
  // 修飾語マスター
  z: [3, 7, 10, 14, 16, 19],
};

/**
 * Keep only what the engine uses from the 医科電子点数表 (column numbers per the
 * 活用手引き §5). Rows whose 変更区分 is "1" (deleted) are dropped.
 */
export function compactTensuhyo(raw) {
  const live = (rows) => rows.filter((r) => r[0] !== "1");
  // 01 補助マスター: code → [包括単位①, G①, 単位②, G②, 単位③, G③, 背反(日), (月), (同時), (週), 入院基本料識別, 算定回数関連]
  const aux = {};
  for (const r of live(raw["01"] ?? [])) aux[r[1]] = [r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[19], r[20]];
  // 02 包括: group → [[child code, 特例条件]]
  const hokatsu = {};
  for (const r of live(raw["02"] ?? [])) (hokatsu[r[1]] ??= []).push([r[2], r[4]]);
  // 03-1..4 背反 (1日 / 同一月 / 同時 / 1週間): [code1, code2, 背反区分, 特例条件]
  const haihan = {};
  for (const [id, key] of [
    ["03-1", "day"],
    ["03-2", "month"],
    ["03-3", "same"],
    ["03-4", "week"],
  ])
    haihan[key] = live(raw[id] ?? []).map((r) => [r[1], r[3], r[5], r[6]]);
  // 04 入院基本料: [group, 加算 code, 加算識別]
  const nyuin = live(raw["04"] ?? []).map((r) => [r[1], r[2], r[4]]);
  // 05 算定回数: [code, 算定単位コード, 上限, 特例条件]
  const kaisu = live(raw["05"] ?? []).map((r) => [r[1], r[3], r[5], r[6]]);
  return { aux, hokatsu, haihan, nyuin, kaisu };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const meta = { builtAt: new Date().toISOString(), sources: [] };

  for (const src of SOURCES) {
    const buf = await getZip(src);
    const files = unzip(buf);
    meta.sources.push({ key: src.key, label: src.label, url: src.url, files: files.map((f) => f.name) });

    if (src.key === "tensuhyo") {
      const raw = {};
      for (const f of files) {
        if (!f.name.toLowerCase().endsWith(".csv")) continue;
        const base = f.name.split("/").pop();
        const id = base.match(/^(\d\d(?:-\d)?)/)?.[1];
        if (id) raw[id] = parseCsv(f.text());
      }
      const tables = compactTensuhyo(raw);
      await writeFile(join(outDir, "tensuhyo.json"), JSON.stringify(tables));
      console.log(`tensuhyo: ${Object.entries(raw).map(([k, v]) => `${k}=${v.length}`).join(" ")}`);
      continue;
    }

    const f = files.find((x) => /\.(csv|txt)$/i.test(x.name));
    if (!f) throw new Error(`no data file in ${src.label}`);
    const rows = parseCsv(f.text());
    const data = COLS[src.key] ? pick(rows, COLS[src.key]) : rows;
    await writeFile(join(outDir, `${src.key}.json`), JSON.stringify({ file: f.name, cols: COLS[src.key] ?? null, rows: data }));
    console.log(`${src.label}: ${f.name} ${rows.length} rows`);
  }

  await writeFile(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
