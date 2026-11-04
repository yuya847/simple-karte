// Search over the official 傷病名マスター and 修飾語マスター (server side).
// Names and codes are used exactly as the master has them.

import { loadMaster, normalizeForSearch } from "./server";

// Column positions in the generated files (see COLS.b / COLS.z in scripts/masters/build.mjs).
const B = { code: 0, moveTo: 1, name: 2, short: 3, kana: 4, keyNumber: 5, adopt: 6, exCode: 7, icd1: 8, icd2: 9, noStandalone: 10, notClaimable: 11, end: 14 } as const;
const Z = { code: 0, name: 1, kana: 2, end: 4, kind: 5 } as const;

export interface DiseaseHit {
  code: string;
  name: string;
  kana: string;
  icd10: string;
  /** 採択区分 as in the master. */
  adopt: string;
  noStandalone: boolean;
  notClaimable: boolean;
}

export interface ModifierHit {
  code: string;
  name: string;
  kana: string;
  /** Suffixes (修飾語区分 A8…, e.g. 「の疑い」) go after the disease name; the rest go before. */
  position: "prefix" | "suffix";
}

const ACTIVE = "99999999";

let diseaseIndex: { hit: DiseaseHit; key: string }[] | null = null;
let modifierIndex: { hit: ModifierHit; key: string }[] | null = null;

function diseases() {
  if (!diseaseIndex) {
    diseaseIndex = loadMaster("b")
      .rows.filter((r) => r[B.end] === ACTIVE)
      .map((r) => ({
        hit: {
          code: r[B.code],
          name: r[B.name],
          kana: r[B.kana],
          icd10: r[B.icd1],
          adopt: r[B.adopt],
          noStandalone: r[B.noStandalone] !== "00" && r[B.noStandalone] !== "",
          notClaimable: r[B.notClaimable] !== "0" && r[B.notClaimable] !== "",
        },
        key: normalizeForSearch(`${r[B.name]}|${r[B.kana]}`),
      }));
  }
  return diseaseIndex;
}

function modifiers() {
  if (!modifierIndex) {
    modifierIndex = loadMaster("z")
      .rows.filter((r) => r[Z.end] === ACTIVE)
      .map((r) => ({
        hit: { code: r[Z.code], name: r[Z.name], kana: r[Z.kana], position: r[Z.kind].startsWith("A8") ? ("suffix" as const) : ("prefix" as const) },
        key: normalizeForSearch(`${r[Z.name]}|${r[Z.kana]}`),
      }));
  }
  return modifierIndex;
}

function rank<T extends { name: string }>(list: { hit: T; key: string }[], q: string, limit: number): T[] {
  const n = normalizeForSearch(q);
  if (!n) return [];
  const scored: { hit: T; score: number }[] = [];
  for (const { hit, key } of list) {
    const name = normalizeForSearch(hit.name);
    let score = -1;
    if (name === n) score = 0;
    else if (name.startsWith(n)) score = 1;
    else if (key.includes(n)) score = 2;
    if (score >= 0) scored.push({ hit, score: score * 1000 + hit.name.length });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.hit);
}

export function searchDiseases(q: string, limit = 30): DiseaseHit[] {
  return rank(diseases(), q, limit);
}

export function searchModifiers(q: string, limit = 20): ModifierHit[] {
  return rank(modifiers(), q, limit);
}

export function findDisease(code: string): DiseaseHit | undefined {
  return diseases().find((d) => d.hit.code === code)?.hit;
}

/**
 * 病名管理番号 and 病名交換用コード (傷病名マスター 項目11・13) of 傷病名コード, for the 電子カルテ情報共有サービス
 * (JP_Condition_eCS needs the 病名管理番号).
 */
export function diseaseKeysOf(codes: string[]): Record<string, { keyNumber: string; exCode: string }> {
  const want = new Set(codes);
  const out: Record<string, { keyNumber: string; exCode: string }> = {};
  for (const r of loadMaster("b").rows) if (want.has(r[B.code]) && r[B.end] === ACTIVE) out[r[B.code]] = { keyNumber: r[B.keyNumber], exCode: r[B.exCode] };
  return out;
}
