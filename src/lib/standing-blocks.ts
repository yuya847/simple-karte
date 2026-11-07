import { emptyStanding, standingEffective, type CallKey, type StandingOrders } from "./standing";
import { lineEffective } from "./standing-calendar";
import type { StandingLine } from "./standing-lines";
import type { CondRule } from "./cond-orders";

export interface BasicBlock {
  rest?: string; adl?: string; diet?: string; bath?: string; elimination?: string;
  monitor?: string; vitals?: string; weight?: string; io?: string;
}
const basicLabels: Record<string, keyof BasicBlock> = {
  安静度: "rest", ADL: "adl", 食事: "diet", 清潔: "bath", 排泄: "elimination", モニター: "monitor",
  バイタル: "vitals", バイタル測定: "vitals", 体重: "weight", 体重測定: "weight", 水分出納: "io",
};
/** Read only labelled values, without inferring absent instructions. */
export function parseBasicBlock(text: string): BasicBlock {
  const out: BasicBlock = {};
  for (const line of text.split("\n").slice(1)) {
    const m = line.match(/^\s*([^：:]+)[：:]\s*(.*?)\s*$/);
    if (!m) continue;
    if (m[1].trim() === "測定") {
      for (const part of m[2].split(/[、,]/)) {
        const measurement = part.trim().match(/^(バイタル(?:測定)?|体重(?:測定)?|水分出納)(?:\s*[：:]\s*|\s+)(.+)$/);
        if (measurement) out[basicLabels[measurement[1]]] = measurement[2].trim();
      }
    } else if (basicLabels[m[1].trim()] && m[2]) out[basicLabels[m[1].trim()]] = m[2];
  }
  return out;
}

/** Only direct numeric thresholds become call criteria; prose remains on the order. */
export function parseCallBlock(text: string): { key: CallKey; value: number }[] {
  const out: { key: CallKey; value: number }[] = [];
  for (const line of text.split("\n").slice(1)) {
    const m = line.trim().match(/^(SBP|収縮期血圧|HR|脈拍|SpO2|体温|BT|呼吸数|RR)\s*(.+)$/i);
    if (!m) continue;
    // Do not mistake a condition with an additional duration/action for a simple threshold.
    const parts = m[2].split(/[・、]/);
    const parsed: typeof out = [];
    for (const part of parts) {
      const n = part.trim().match(/^(\d+(?:\.\d+)?)\s*(?:mmHg|\/分|%|％|℃|°C)?\s*(以下|以上|未満)$/i);
      if (!n) { parsed.length = 0; break; }
      const name = m[1].toLowerCase(), op = n[2];
      let key: CallKey | undefined;
      if (/^(sbp|収縮期血圧)$/.test(name)) key = op === '以下' ? 'sbpLow' : op === '以上' ? 'sbpHigh' : undefined;
      else if (/^(hr|脈拍)$/.test(name)) key = op === '以下' ? 'hrLow' : op === '以上' ? 'hrHigh' : undefined;
      else if (name === 'spo2' && op === '未満') key = 'spo2';
      else if (/^(bt|体温)$/.test(name) && op === '以上') key = 'bt';
      else if (/^(rr|呼吸数)$/.test(name) && op === '以上') key = 'rr';
      if (key && Number.isFinite(Number(n[1]))) parsed.push({key, value: Number(n[1])});
    }
    out.push(...parsed);
  }
  return out;
}

/** Preserve the two explicit conditional seed orders as conditions, including their actions. */
export function parseConditionalBlock(text: string): CondRule[] {
  return text.split('\n').slice(1).filter(line => /なら：/.test(line)).flatMap((line, i) => {
    const m = line.trim().match(/^(K|収縮期血圧)\s+(\d+(?:\.\d+)?)\s*(?:mmol\/L|mmHg)\s+(未満|以下|以上)なら：(.+)$/);
    if (!m) return [];
    return [{id: `block-cond-${i}`, source: m[1] === 'K' ? 'lab' : 'vital', item: m[1] === 'K' ? 'K' : 'sbp', value: Number(m[2]), op: m[3] === '未満' ? '<' : m[3] === '以下' ? '≤' : '≥', action: m[4], callDoctor: m[4].includes('医師へ連絡') } as CondRule];
  });
}

/** Active blocks take precedence per field/key. Ended, stopped and future blocks never supply values.
 * Receipts remain in the line-change queue; this projection never creates another nursing receipt. */
export function standingFromBlocks(lines: StandingLine[], fields?: StandingOrders, day = 0, time = "12:00"): StandingOrders | undefined {
  const active = lines.filter(l => lineEffective(l, day, time)).sort((a,b) => a.start.day-b.start.day || (a.start.time??'00:00').localeCompare(b.start.time??'00:00'));
  const basics = active.filter(l => /^基本指示(?:（.*）)?$/.test(l.text.split('\n')[0]));
  const calls = active.filter(l => /^(?:Dr\.?\s*call|Drコール|ドクターコール|医師を呼ぶ).*指示$/i.test(l.text.split('\n')[0]));
  const fallback = fields && (fields.at.day < day || (fields.at.day === day && fields.at.time <= time)) ? standingEffective(fields, day) : undefined;
  if (!active.length) return fallback;
  const s = {...(fallback ?? emptyStanding(active.at(-1)!.by, active.at(-1)!.at))};
  const basic = Object.assign({}, ...basics.map(l => parseBasicBlock(l.text))) as BasicBlock;
  // Free text is retained verbatim; consumers display it or recognize a supported measurement frequency.
  for (const key of ['rest','bath','vitals','weight','io'] as const) if (basic[key] !== undefined) (s[key] as string | null) = basic[key];
  const restLine = active.filter(l=>l.cat==='安静').at(-1);
  if(restLine) (s.rest as string | null) = restLine.text.replace(/^(?:術後指示|安静度)[：:]\s*/, '');
  s.blockCallTexts = calls.flatMap(l => l.text.split("\n").slice(1).filter(Boolean));
  s.blockPrnTexts = active.filter(l => l.cat === "頓用").map(l => l.text);
  const parsed = calls.flatMap(l => parseCallBlock(l.text));
  s.calls = [...new Map([...(s.calls ?? []), ...parsed].map(c => [c.key, c])).values()];
  if (calls.length) s.callConscious = calls.some(l => /意識レベル.*低下/.test(l.text));
  const conds = calls.flatMap(l => parseConditionalBlock(l.text).map(c => ({ ...c, id: `${l.id}:${c.id}` })));
  if (conds.length) s.conds = [...(s.conds ?? []).filter(c => !conds.some(p => p.source === c.source && p.item === c.item && p.op === c.op)), ...conds];
  const prnScenes = active.filter(l => l.cat === '頓用').map(l => l.text.split('\n')[0].replace(/指示$/, ''));
  s.prn = s.prn.filter(r => !prnScenes.includes(r.when));
  if (!fallback) s.taken = {by: '指示ごとの指示受けを参照', time};
  return s;
}

/** Discharge closes active blocks and cancels future blocks while preserving their original periods. */
export function endStandingBlocks(lines: StandingLine[], by: string, day: number, time: string): StandingLine[] {
  return lines.map(l => {
    const future = l.start.day > day || (l.start.day === day && (l.start.time ?? '00:00') > time);
    return !l.stop && (future || lineEffective(l, day, time)) ? { ...l, stop: { day, time, by, reason: '退院のため', kind: '終了' } } : l;
  });
}
