"use client";

import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { PATH_KINDS, PATH_METHODS, PATH_RULES, caseTitle, casesOf, pathStatus, requestProblems, type PathCase, type PathKind, type PathRequest } from "@/lib/pathology";
import { useMe } from "../RoleContext";

interface Props {
  patientId: string;
  patientName: string;
  cases: PathCase[];
  onAdd: (c: PathCase) => void;
  nowTime: string;
}

const field = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";

/** 病理の依頼 (組織診・細胞診・術中迅速), and this patient's requests and where they are. */
export function PathRequestPanel({ patientId, patientName, cases, onAdd, nowTime }: Props) {
  const me = useMe();
  const [kind, setKind] = useState<PathKind>("組織診");
  const [site, setSite] = useState("");
  const [method, setMethod] = useState(PATH_METHODS.組織診[0]);
  const [containers, setContainers] = useState(1);
  const [clinical, setClinical] = useState("");
  const [question, setQuestion] = useState("");
  const [fixed, setFixed] = useState("");
  const [room, setRoom] = useState("");
  const [frozenAt, setFrozenAt] = useState("");
  const [phone, setPhone] = useState("");
  const req: PathRequest = {
    kind,
    site,
    method,
    containers,
    clinical,
    question,
    ...(kind === "組織診" && fixed ? { fixed: { day: 0, time: fixed } } : {}),
    ...(kind === "術中迅速" ? { frozen: { room, at: { day: 0, time: frozenAt }, phone } } : {}),
  };
  const missing = requestProblems(req);
  const submit = () => {
    if (missing.length) return;
    const c: PathCase = { ...req, site: site.trim(), clinical: clinical.trim(), question: question.trim(), id: crypto.randomUUID(), patientId, ordered: { day: 0, time: nowTime, by: me.name }, steps: [] };
    onAdd(c);
    auditLog({ role: me.role, actor: me.name, action: "確定（病理の依頼）", patient: patientName, detail: caseTitle(c) });
    setSite("");
    setClinical("");
    setQuestion("");
  };
  const mine = casesOf(cases, patientId);
  return (
    <div className="space-y-3 text-[12px]">
      <div className="flex gap-1">
        {PATH_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setMethod(PATH_METHODS[k][0]);
            }}
            aria-pressed={kind === k}
            className={`rounded border px-2.5 py-0.5 ${kind === k ? "border-ai bg-ai font-bold text-white" : "border-rule"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[6rem_1fr] items-center gap-x-2 gap-y-1.5">
        <span>臓器・部位</span>
        <input value={site} onChange={(e) => setSite(e.target.value)} placeholder={kind === "細胞診" ? "例：喀痰、右胸水" : "例：胃 前庭部、右下腿 皮膚"} className={field} />
        <span>採取の方法</span>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
          {PATH_METHODS[kind].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <span>容器の数</span>
        <input type="number" min={1} value={containers} onChange={(e) => setContainers(Number(e.target.value))} className={`${field} nums w-16`} />
        {kind === "組織診" && (
          <>
            <span>固定を始めた</span>
            <span className="flex items-center gap-1">
              今日 <input type="time" value={fixed} onChange={(e) => setFixed(e.target.value)} aria-label="ホルマリン固定を始めた時刻" className={`${field} nums`} />
              <span className="text-ink-soft">（ホルマリン。わかれば）</span>
            </span>
          </>
        )}
        {kind === "術中迅速" && (
          <>
            <span>手術室・時刻</span>
            <span className="flex items-center gap-1">
              <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="例：手術室2" aria-label="手術室" className={`${field} w-28`} />
              今日 <input type="time" value={frozenAt} onChange={(e) => setFrozenAt(e.target.value)} aria-label="検体が出る予定の時刻" className={`${field} nums`} />
              ごろ
            </span>
            <span>結果の連絡先</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例：手術室2 内線 2102" className={field} />
          </>
        )}
        <span>臨床診断・経過</span>
        <textarea value={clinical} onChange={(e) => setClinical(e.target.value)} rows={2} className={field} />
        <span>知りたいこと</span>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} className={field} />
      </div>
      {missing.length > 0 && <p className="text-ink-soft">未入力：{missing.join("・")}</p>}
      <button type="button" disabled={missing.length > 0} onClick={submit} className="w-full rounded-md bg-ai px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
        病理に依頼する
      </button>
      <p className="text-[11px] text-ink-soft">{kind === "術中迅速" ? PATH_RULES.frozen : PATH_RULES.report}</p>

      <section>
        <h3 className="mb-1 font-bold">この患者の病理（{mine.length}件）</h3>
        {mine.length === 0 && <p className="text-ink-faint">まだありません。</p>}
        <ul className="space-y-1">
          {mine.map((c) => (
            <li key={c.id} className="rounded border border-rule bg-paper px-2 py-1">
              <span className="font-bold">{caseTitle(c)}</span> <span className="nums font-mono text-ink-soft">{c.received?.number ?? ""}</span> <span className="text-ink-soft">{pathStatus(c)}</span>
              {c.report && <span className="block">病理診断：{c.report.diagnosis}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
