"use client";

import { code128Widths } from "@/lib/barcode";

/** A Code 128 barcode as SVG (black bars on white), the code printed under it. */
export function Barcode({ value, height = 28, module = 1.2, text = true }: { value: string; height?: number; module?: number; text?: boolean }) {
  let widths: number[];
  try {
    widths = code128Widths(value);
  } catch {
    return <span className="text-[10px] text-shu">バーコードにできない文字があります</span>;
  }
  const quiet = 10;
  const total = widths.reduce((s, w) => s + w, 0) + quiet * 2;
  let x = quiet;
  const bars = widths.map((w, i) => {
    const r = i % 2 === 0 ? <rect key={i} x={x * module} y={0} width={w * module} height={height} fill="#000" /> : null;
    x += w;
    return r;
  });
  return (
    <span className="inline-flex flex-col items-center">
      <svg width={total * module} height={height} viewBox={`0 0 ${total * module} ${height}`} role="img" aria-label={`バーコード ${value}`} className="bg-white">
        {bars}
      </svg>
      {text && <span className="nums font-mono text-[9px] leading-none tracking-wider">{value}</span>}
    </span>
  );
}

export interface LabelPatient {
  id: string;
  name: string;
  kana: string;
  ageSex: string;
  where: string;
  allergies: string[];
  blood?: string;
}

const frame = "break-inside-avoid overflow-hidden rounded border border-ink/60 bg-white p-1.5 text-ink print:rounded-none";

/** 患者ラベル (for forms and specimen bags): name, ID barcode, age and sex, ward. */
export function PatientLabel({ p }: { p: LabelPatient }) {
  return (
    <div className={`${frame} h-[30mm] w-[60mm] text-[9pt] leading-tight`}>
      <div className="text-[7pt]">{p.kana}</div>
      <div className="text-[11pt] font-bold">{p.name}</div>
      <div className="nums">
        ID {p.id}　{p.ageSex}　{p.where}
      </div>
      <Barcode value={p.id} height={22} module={1} />
    </div>
  );
}

/** リストバンド: long and thin; ID barcode, allergy in red, blood type. */
export function Wristband({ p }: { p: LabelPatient }) {
  return (
    <div className={`${frame} flex h-[22mm] w-[190mm] items-center gap-3 text-[9pt]`}>
      <div className="min-w-0">
        <div className="text-[7pt]">{p.kana}</div>
        <div className="text-[13pt] font-bold leading-tight">{p.name}</div>
        <div className="nums">
          ID {p.id}　{p.ageSex}
          {p.blood ? `　${p.blood}` : ""}
        </div>
      </div>
      <Barcode value={p.id} height={30} module={1.1} />
      {p.allergies.length > 0 && <div className="rounded bg-shu px-1.5 py-0.5 text-[8pt] font-bold text-white">アレルギー：{p.allergies.join("、")}</div>}
    </div>
  );
}

export interface SpecimenItem {
  code: string;
  when: string;
  tests: string;
  container: string;
}

/** 検体ラベル: the code read at the bedside (照合), patient, when, tests and the tube. */
export function SpecimenLabel({ p, s }: { p: LabelPatient; s: SpecimenItem }) {
  return (
    <div className={`${frame} h-[25mm] w-[50mm] text-[7.5pt] leading-tight`}>
      <div className="flex items-baseline gap-1">
        <b className="text-[9pt]">{p.name}</b>
        <span className="nums">{p.id}</span>
      </div>
      <div className="nums">
        {s.when}　容器 {s.container}
      </div>
      <div className="truncate">{s.tests}</div>
      <Barcode value={s.code} height={16} module={0.9} />
    </div>
  );
}

export interface DrugItem {
  code: string;
  when: string;
  main: string;
  detail: string;
}

/** 薬剤ラベル (stuck on the drip bag): patient, room, drugs and amounts, route and pace, time, code. */
export function DrugLabel({ p, d }: { p: LabelPatient; d: DrugItem }) {
  return (
    <div className={`${frame} h-[45mm] w-[70mm] text-[8pt] leading-snug`}>
      <div className="flex items-baseline gap-1 border-b border-ink/40 pb-0.5">
        <b className="text-[11pt]">{p.name}</b>
        <span className="nums ml-auto">{p.where}</span>
      </div>
      <div className="nums text-[7pt]">ID {p.id}　{p.ageSex}</div>
      <div className="mt-0.5 text-[9pt] font-bold">{d.main}</div>
      <div className="text-[7.5pt]">{d.detail}</div>
      <div className="nums mt-0.5 font-bold">投与 {d.when}</div>
      {p.allergies.length > 0 && <div className="text-[7pt] font-bold">アレルギー：{p.allergies.join("、")}</div>}
      <Barcode value={d.code} height={18} module={1} />
    </div>
  );
}
