"use client";

import { History, RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { kanaMatch } from "@/lib/kana";
import {
  addMasterChanges,
  changesFor,
  editProblem,
  fieldsOf,
  findRow,
  FIELD_LABEL,
  MASTER_KINDS,
  MASTER_SOURCE,
  masterRows,
  resetChange,
  useMasterLocal,
  useMasterLog,
  type FieldEdit,
  type MasterChange,
  type MasterKind,
} from "@/lib/master-local";
import type { Action } from "@/lib/roles";
import { Fictional, Sources, SubTabs } from "./DeskParts";
import { DenyNote, useDeny, useMe } from "./RoleContext";

const ACTION: Record<MasterKind, Action> = { 注射薬: "master.drug", 内服薬: "master.drug", 検体検査: "master.lab", 処置: "master.proc" };

interface Form {
  code: string;
  adopted: boolean;
  stopped: boolean;
  localName: string;
  order: string;
  reason: string;
}

const itemName = (c: MasterChange) => (c.kind === "*" ? "すべてのマスタ" : c.code === "*" ? `${c.kind}のすべて` : (findRow(c.kind, c.code)?.name ?? c.code));
const changeLine = (c: MasterChange) => (c.field === "reset" ? "初めの状態に戻した" : `${FIELD_LABEL[c.field]}：${c.before} → ${c.after}`);

/**
 * マスタ管理: the hospital's own fields of the drug, lab and procedure masters (採用・院内名・表示順・中止).
 * A change is a line of history kept in the day's records; the pickers and the order checks use it at once.
 */
export function MasterView({ nowTime, newId }: { nowTime: string; newId: () => string }) {
  const me = useMe();
  const deny = useDeny();
  const log = useMasterLog();
  const ov = useMasterLocal();
  const [kind, setKind] = useState<MasterKind>("注射薬");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [resetReason, setResetReason] = useState("");
  const action = ACTION[kind];
  const locked = !!deny(action);
  const meta = (reason: string) => ({ reason, by: me.name, role: me.role, at: { day: 0, time: nowTime } });

  const rows = masterRows(kind)
    .filter((r) => !q.trim() || [r.name, r.code, fieldsOf(ov, kind, r.code).localName, ...r.aliases].some((w) => w && kanaMatch(w, q)))
    .map((r) => ({ r, f: fieldsOf(ov, kind, r.code) }))
    .sort((a, b) => a.f.order - b.f.order || a.r.base - b.r.base);
  const lastOf = (code: string) => [...log].reverse().find((c) => (c.kind === kind && (c.code === code || c.code === "*")) || c.kind === "*");
  const changedCount = masterRows(kind).filter((r) => ov.has(`${kind}|${r.code}`)).length;

  const open = (code: string) => {
    const f = fieldsOf(ov, kind, code);
    setProblem(null);
    setForm({ code, adopted: f.adopted, stopped: f.stopped, localName: f.localName, order: String(f.order), reason: "" });
  };
  const save = () => {
    if (!form) return;
    const edit: FieldEdit = { adopted: form.adopted, stopped: form.stopped, localName: form.localName, order: Number(form.order) };
    const why = editProblem(edit, form.reason);
    if (why) return setProblem(why);
    const cs = changesFor(ov, kind, form.code, edit, meta(form.reason), newId);
    if (!cs.length) return setProblem("変わったところがありません。");
    addMasterChanges(cs);
    auditLog({ role: me.role, actor: me.name, action: `確定（マスタ管理：${kind}）`, detail: `${findRow(kind, form.code)?.name ?? form.code}　${cs.map(changeLine).join("、")}　理由：${form.reason.trim()}`.slice(0, 200) });
    setForm(null);
  };
  const resetItem = () => {
    if (!form) return;
    if (!form.reason.trim()) return setProblem("初めに戻す理由を書いてください（履歴に残ります）。");
    addMasterChanges([resetChange(kind, form.code, meta(form.reason), newId)]);
    auditLog({ role: me.role, actor: me.name, action: `確定（マスタ管理：${kind}を初めに戻した）`, detail: `${findRow(kind, form.code)?.name ?? form.code}　理由：${form.reason.trim()}`.slice(0, 200) });
    setForm(null);
  };
  const resetAll = () => {
    if (!resetReason.trim()) return;
    addMasterChanges([resetChange(kind, "*", meta(resetReason), newId)]);
    auditLog({ role: me.role, actor: me.name, action: `確定（マスタ管理：${kind}をすべて初めに戻した）`, detail: `理由：${resetReason.trim()}`.slice(0, 200) });
    setResetReason("");
    setForm(null);
  };

  const shownLog = log.filter((c) => c.kind === kind || c.kind === "*").toReversed();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SubTabs label="マスタの種類" value={kind} onChange={(k) => (setKind(k), setForm(null), setQ(""))} tabs={MASTER_KINDS.map((k) => ({ key: k, label: k }))} />
        <label className="flex items-center gap-1 rounded-md border border-rule bg-sheet px-2 py-1">
          <Search size={14} className="text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・コードで探す（ひらがな可）" aria-label="マスタを探す" className="w-56 bg-transparent outline-none" />
        </label>
        <span className="text-[12px] text-ink-soft">{changedCount ? `院内で変えた品目 ${changedCount}件` : "変えた品目はありません（初めの状態）"}</span>
      </div>
      <p className="hint text-[12px] text-ink-soft">
        「変える」で採用・院内名・表示順・中止を変え、理由を書いて保存します。中止と非採用の品目はオーダの一覧から外れ、下書きにあると確定できません。院内名と表示順はオーダの一覧に出ます（もう出したオーダは、出したときの名前のまま）。表示順は小さいほど上で、初めは 10・20・30… なので、間に入れられます。
      </p>
      <p className="text-[12px] text-ink-soft">
        変えたことは、元のマスタのファイルを書き換えずに、その日の記録（記録の保存が設定されているときは Supabase）に履歴として残ります。誰がどのマスタを変えるか（注射薬・内服薬は薬剤師、検体検査は臨床検査技師、処置は医事課）は架空の病院の取り決めです。
        <Fictional text="架空の病院の取り決め" />
      </p>
      <DenyNote action={action} />

      <table className="w-full border-collapse bg-sheet text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-[11px] text-ink-faint">
            <th className="px-2 py-1 font-normal">表示順</th>
            <th className="px-2 py-1 font-normal">コード</th>
            <th className="px-2 py-1 font-normal">標準の名前</th>
            <th className="px-2 py-1 font-normal">院内名</th>
            <th className="px-2 py-1 font-normal">採用</th>
            <th className="px-2 py-1 font-normal">中止</th>
            <th className="px-2 py-1 font-normal">最後の変更</th>
            <th className="px-2 py-1 font-normal" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ r, f }) => {
            const last = lastOf(r.code);
            const off = !f.adopted || f.stopped;
            const editing = form?.code === r.code;
            return (
              <tr key={r.code} className={`border-b border-rule-soft align-top ${off ? "text-ink-faint" : ""} ${editing ? "bg-ai-soft/40" : ""}`}>
                <td className="nums px-2 py-1">{f.order}</td>
                <td className="nums px-2 py-1 text-[11px]">{r.code}</td>
                <td className="px-2 py-1">
                  {r.name}
                  {r.sub && <span className="block text-[11px] text-ink-faint">{r.sub}</span>}
                </td>
                <td className="px-2 py-1">{f.localName || <span className="text-ink-faint">—</span>}</td>
                <td className="px-2 py-1">{f.adopted ? "採用" : <b className="text-yamabuki">非採用</b>}</td>
                <td className="px-2 py-1">{f.stopped ? <b className="text-shu">中止</b> : <span className="text-ink-faint">—</span>}</td>
                <td className="nums px-2 py-1 text-[11px] text-ink-soft">{last ? `${last.at.time} ${last.by}` : <span className="text-ink-faint">—</span>}</td>
                <td className="px-2 py-1 text-right">
                  {editing ? (
                    <EditForm form={form!} onForm={setForm} problem={problem} onSave={save} onReset={resetItem} onCancel={() => setForm(null)} />
                  ) : (
                    <button type="button" disabled={locked} onClick={() => open(r.code)} className="rounded border border-rule px-2 py-0.5 hover:border-ai hover:text-ai disabled:opacity-40">
                      変える
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-2 py-3 text-ink-faint">
                見つかりません。
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <section className="flex flex-wrap items-center gap-2 rounded-md border border-rule bg-sheet px-3 py-2 text-[12px]">
        <RotateCcw size={14} className="text-ink-soft" />
        <span>{kind}のマスタをすべて初めの状態に戻す</span>
        <input value={resetReason} onChange={(e) => setResetReason(e.target.value)} disabled={locked} placeholder="理由（履歴に残ります）" aria-label="すべて初めに戻す理由" className="w-56 rounded border border-rule bg-paper px-2 py-0.5" />
        <button type="button" disabled={locked || !resetReason.trim() || changedCount === 0} onClick={resetAll} className="rounded border border-shu px-2 py-0.5 text-shu disabled:opacity-40">
          初めに戻す
        </button>
      </section>

      <section>
        <h2 className="mb-1 flex items-center gap-1 text-sm font-bold">
          <History size={14} />
          {kind}の変更の履歴（{shownLog.length}件）
        </h2>
        {shownLog.length === 0 ? (
          <p className="text-[12px] text-ink-faint">まだ変更はありません。</p>
        ) : (
          <ul className="space-y-0.5 text-[12px]">
            {shownLog.map((c) => (
              <li key={c.id} className="nums flex flex-wrap gap-x-2 border-b border-rule-soft py-0.5">
                <span className="text-ink-faint">{c.at.time}</span>
                <span>{c.by}</span>
                <b>{itemName(c)}</b>
                <span>{changeLine(c)}</span>
                <span className="text-ink-soft">理由：{c.reason}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-ink-faint">履歴は追記だけで、直したり消したりはできません（初めに戻すのも1行として残ります）。</p>
      </section>
      <Sources items={[MASTER_SOURCE]} />
    </div>
  );
}

function EditForm({ form, onForm, problem, onSave, onReset, onCancel }: { form: Form; onForm: (f: Form) => void; problem: string | null; onSave: () => void; onReset: () => void; onCancel: () => void }) {
  const set = (patch: Partial<Form>) => onForm({ ...form, ...patch });
  return (
    <div className="min-w-72 space-y-1.5 rounded-md border border-ai bg-sheet p-2 text-left">
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={form.adopted} onChange={(e) => set({ adopted: e.target.checked })} />
          採用
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={form.stopped} onChange={(e) => set({ stopped: e.target.checked })} />
          中止（新しいオーダを止める）
        </label>
      </div>
      <label className="flex items-center gap-1">
        <span className="w-14 shrink-0 text-ink-soft">院内名</span>
        <input value={form.localName} onChange={(e) => set({ localName: e.target.value })} placeholder="空なら標準の名前" className="min-w-0 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
      </label>
      <label className="flex items-center gap-1">
        <span className="w-14 shrink-0 text-ink-soft">表示順</span>
        <input value={form.order} onChange={(e) => set({ order: e.target.value })} inputMode="numeric" className="nums w-20 rounded border border-rule bg-paper px-1.5 py-0.5" />
      </label>
      <label className="flex items-center gap-1">
        <span className="w-14 shrink-0 text-ink-soft">理由</span>
        <input value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="例：供給停止のため中止" className="min-w-0 flex-1 rounded border border-rule bg-paper px-1.5 py-0.5" />
      </label>
      {problem && <p className="text-yamabuki">{problem}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={onSave} className="rounded bg-ai px-3 py-0.5 font-bold text-white">
          保存
        </button>
        <button type="button" onClick={onReset} className="rounded border border-rule px-2 py-0.5">
          この品目を初めに戻す
        </button>
        <button type="button" onClick={onCancel} className="rounded px-2 py-0.5 text-ink-soft">
          やめる
        </button>
      </div>
    </div>
  );
}
