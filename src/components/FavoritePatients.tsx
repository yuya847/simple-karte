"use client";

import { Star } from "lucide-react";
import { diagnosisLabel, type Diagnosis } from "@/lib/diagnoses";
import { abs } from "@/lib/flowsheet";
import { flagsFor, type Flag } from "@/lib/patient-flags";
import { ageSex } from "@/lib/person";
import { currentEntries, ordersOf, type SessionChanges } from "@/lib/record";
import type { Patient } from "@/lib/types";
import { useFavorites } from "@/lib/use-favorites";
import { Flags } from "./patient-columns";
import { PatientAvatar } from "./PatientAvatar";
import { StarButton } from "./StarButton";

interface Props {
  /** Every patient of the hospital (the stars are not limited to one ward). */
  patient: (id: string) => Patient | undefined;
  nowTime: string;
  changes: Record<string, SessionChanges>;
  /** 指示受けがまだ, per patient. */
  waiting?: Record<string, number>;
  /** Results not yet seen by the doctor. */
  resultState?: Record<string, { unseen: number; panic: number }>;
  /** More marks per patient from outside the record (the same as the patient list's). */
  extraFlags?: Record<string, Flag[]>;
  /** Registered diagnoses: the main ones are shown; the admission diagnosis when none is registered. */
  diagnoses?: Record<string, Diagnosis[]>;
  onOpen: (id: string) => void;
}

/** お気に入りの患者: the patients this person starred (☆), from every ward; press one to open its chart. */
export function FavoritePatients(props: Props) {
  const [ids, toggle] = useFavorites();
  return <FavoriteList {...props} ids={ids} onToggle={toggle} />;
}

/** The list with the stars given (FavoritePatients reads them for the person; tests pass them). */
export function FavoriteList({ ids, onToggle, patient, nowTime, changes, waiting = {}, resultState = {}, extraFlags = {}, diagnoses = {}, onOpen }: Props & { ids: string[]; onToggle: (id: string) => void }) {
  const nowAbs = abs(0, nowTime);
  const rows = ids.flatMap((id) => {
    const p = patient(id);
    if (!p) return [];
    const entries = ordersOf(currentEntries(p, changes[p.id]));
    const flags = [...(extraFlags[p.id] ?? []), ...flagsFor(p, entries, nowAbs, waiting[p.id] ?? 0, undefined, 0, resultState[p.id])];
    const mains = (diagnoses[p.id] ?? []).filter((d) => d.main && d.outcome === "継続");
    return [{ p, flags, main: mains.length ? mains.map(diagnosisLabel).join("、") : null }];
  });
  const gone = ids.length - rows.length;
  return (
    <section aria-label="お気に入りの患者" className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Star size={18} className="text-yamabuki" fill="currentColor" />
          お気に入りの患者
          <span className="nums ml-1 text-sm font-normal text-ink-soft">{rows.length}人</span>
        </h1>
        <p className="text-[12px] text-ink-soft">
          氏名の横の☆で登録した患者を、全病棟から新しい順に並べます。お気に入りはこの端末のみに自分の名前で保存されます。
          <span className="hint">患者一覧の氏名の横、カルテの患者バーの名前の横の☆で登録・解除できます。ここの☆を押すと外れます。印は記録からコードで出したもので、判断ではありません。</span>
        </p>
        {gone > 0 && <span className="text-[12px] text-ink-faint">退院などでいまの患者にいない {gone}人は出していません。</span>}
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-faint">まだお気に入りはありません。患者一覧やカルテの氏名の横の☆を押すと、ここに並びます。</p>
      ) : (
        <ul className="divide-y divide-rule-soft bg-sheet">
          {rows.map(({ p, flags, main }) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-ai-soft/40 pointer-coarse:py-3.5">
              <StarButton on name={p.name} onToggle={() => onToggle(p.id)} size={16} />
              <button type="button" onClick={() => onOpen(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <PatientAvatar sex={p.sex} age={p.age} size={30} className="rounded-full" />
                <span className="nums w-24 shrink-0 text-[12px] text-ink-soft">
                  {p.ward ? `${p.ward}・` : ""}
                  {p.room}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] text-ink-faint">{p.kana}</span>
                  <span className="font-bold text-ai">{p.name}</span>
                  <span className="ml-2 text-[12px] text-ink-soft">
                    {ageSex(p)}　{main ?? <span>入院時：{p.admissionDiagnosis}</span>}
                  </span>
                </span>
                <span className="shrink-0">
                  <Flags flags={flags} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
