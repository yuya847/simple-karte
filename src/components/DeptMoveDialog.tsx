"use client";

import { X } from "lucide-react";
import { useState } from "react";
import type { Patient } from "@/lib/types";

/** Departments of the fictional hospital and their attending doctors (choices, not a recommendation). */
export const DEPT_DOCTORS: Record<string, string[]> = {
  総合診療科: ["山本（専攻医）", "木下（総合診療科 B）"],
  循環器内科: ["中川（循環器内科）"],
  呼吸器内科: ["佐藤（呼吸器内科）"],
  消化器内科: ["田村（消化器内科）"],
  腎臓内科: ["井上（腎臓内科）"],
  脳神経内科: ["林（脳神経内科）"],
  整形外科: ["森本（整形外科）"],
  外科: ["石川（外科）"],
  泌尿器科: ["前田（泌尿器科）"],
};

/** 転科の予約: the new department and attending doctor, the time and the reason (all chosen by the doctor). */
export function DeptMoveDialog({ patient, dayLabel, onCancel, onBook }: { patient: Patient; dayLabel: string; onCancel: () => void; onBook: (m: { toDept: string; toDoctor: string; time: string; reason: string }) => void }) {
  const [dept, setDept] = useState("");
  const [doctor, setDoctor] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const input = "rounded border border-rule bg-paper px-2 py-1";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" role="dialog" aria-label="転科の予約">
      <div className="w-full max-w-lg space-y-3 rounded-lg border border-rule bg-sheet p-4 text-[13px] shadow-xl">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold">
            転科の予約（{dayLabel}）：{patient.name}
          </h2>
          <button type="button" onClick={onCancel} aria-label="閉じる" className="ml-auto rounded p-1 text-ink-faint hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <p className="text-ink-soft">
          いま：{patient.department}・主治医 {patient.attending}
        </p>
        <label className="flex items-center gap-2">
          転科先
          <select
            value={dept}
            onChange={(e) => {
              setDept(e.target.value);
              setDoctor("");
            }}
            className={input}
          >
            <option value="">選ぶ</option>
            {Object.keys(DEPT_DOCTORS)
              .filter((d) => d !== patient.department)
              .map((d) => (
                <option key={d}>{d}</option>
              ))}
          </select>
        </label>
        {dept && (
          <label className="flex items-center gap-2">
            新しい主治医
            <select value={doctor} onChange={(e) => setDoctor(e.target.value)} className={input}>
              <option value="">選ぶ</option>
              {DEPT_DOCTORS[dept].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          時刻
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
        </label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由（例：心房細動の治療のため、循環器内科と相談済み）" aria-label="転科の理由" className={`${input} w-full`} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-rule px-3 py-1.5 text-ink-soft">
            やめる
          </button>
          <button type="button" disabled={!dept || !doctor || !time || !reason.trim()} onClick={() => onBook({ toDept: dept, toDoctor: doctor, time, reason: reason.trim() })} className="rounded-md bg-ai px-4 py-1.5 font-bold text-white disabled:opacity-40">
            転科の予約を下書きにする
          </button>
        </div>
      </div>
    </div>
  );
}
