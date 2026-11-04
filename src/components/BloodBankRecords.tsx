"use client";

import { auditLog } from "@/lib/audit";
import { BLOOD_RULES, BLOOD_SOURCES, SEVERE, SYMPTOMS, bagLabel, momentOf, momentText, productName, reactionCounts, usageRecords, type TxAdmin } from "@/lib/blood-bank";
import { isoDate } from "@/lib/dates";
import { TX_PRODUCTS } from "@/lib/procedures";
import { useDeny, useMe } from "./RoleContext";
import { SourceNote, bbCard, type BloodBankProps } from "./BloodBankView";

// ---------------------------------------------------------------------------
// 副反応
// ---------------------------------------------------------------------------

export function BloodReactions({ bank, onBank, nowAbs, people }: BloodBankProps & { nowAbs: number }) {
  const me = useMe();
  const deny = useDeny()("blood.bank");
  const list = Object.values(bank.admins).filter((a) => a.reaction);
  const nameOf = (pid: string) => people.find((x) => x.patient.id === pid);
  const mark = (a: TxAdmin, what: "received" | "centre") => {
    const at = momentOf(nowAbs);
    onBank((b) => ({ ...b, admins: { ...b.admins, [a.lot]: { ...a, reaction: { ...a.reaction!, [what]: { ...at, by: me.name } } } } }));
    auditLog({ role: me.role, actor: me.name, action: what === "received" ? "確定（輸血の副反応の報告を受けた）" : "血液センターへ副反応を報告（模擬）", patient: nameOf(a.patientId)?.patient.name, detail: `製造番号 ${a.lot}　${a.reaction!.symptoms.join("・")}` });
  };
  const counts = reactionCounts(bank);
  return (
    <section className="space-y-3">
      {list.length === 0 && <p className={`${bbCard} px-4 py-3 text-ink-soft`}>副反応の報告はありません。</p>}
      {list.map((a) => {
        const r = a.reaction!;
        const u = bank.units.find((x) => x.lot === a.lot);
        const who = nameOf(a.patientId);
        const severe = r.symptoms.filter((s) => SEVERE.includes(s));
        return (
          <article key={a.lot} className={`${bbCard} p-3 text-[12px] ${severe.length ? "border-shu/60" : ""}`}>
            <header className="flex flex-wrap items-baseline gap-x-3">
              <b>
                {who ? `${who.room}　${who.patient.name}` : a.patientId}
              </b>
              <span>{u ? `${productName(u.product)} ${bagLabel(u)}` : ""}</span>
              <span className="font-mono">{a.lot}</span>
              <span className="nums text-ink-soft">
                開始 {a.start?.time ?? "—"}　記録 {momentText(r)} {r.by}
              </span>
            </header>
            <p className="mt-1">
              症状：
              {r.symptoms.map((s) => (
                <span key={s} className={`mr-1.5 ${SEVERE.includes(s) ? "font-bold text-shu" : ""}`}>
                  {s}
                </span>
              ))}
              <span className="text-ink-soft">（輸血開始から {r.onsetMin}分）</span>
            </p>
            {severe.length > 0 && <p className="font-bold text-shu">重症副反応の可能性が高い項目（{severe.join("・")}）：詳細を確かめてください。</p>}
            <p>対応：{r.action}</p>
            <p>使用済みバッグと輸血セット：{r.bagKept ? "回収して保管" : <b className="text-shu">回収の記録なし</b>}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              {r.received ? (
                <span className="text-wakatake">
                  輸血部門が受けた {r.received.time} {r.received.by}
                </span>
              ) : (
                <button type="button" disabled={!!deny} onClick={() => mark(a, "received")} className="rounded bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40">
                  受けた
                </button>
              )}
              {r.centre ? (
                <span className="text-ink-soft">
                  血液センターへ報告（模擬）{r.centre.time} {r.centre.by}
                </span>
              ) : (
                <button type="button" disabled={!!deny || !r.received} onClick={() => mark(a, "centre")} className="rounded border border-rule px-2 py-0.5 text-ink-soft disabled:opacity-40">
                  血液センターへ報告した（模擬：つながりません）
                </button>
              )}
            </p>
          </article>
        );
      })}

      <div className={`${bbCard} overflow-x-auto p-3 text-[12px]`}>
        <b>副反応の件数（バッグごと。症状は重なることがある）</b>
        <table className="nums mt-1 w-full border-collapse">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="py-0.5 pr-2 font-normal" />
              {counts.map((c) => (
                <th key={c.product} className="py-0.5 pr-2 font-normal">
                  {TX_PRODUCTS[c.product].short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-rule-soft">
              <td className="py-0.5 pr-2">輸血したバッグ</td>
              {counts.map((c) => (
                <td key={c.product} className="pr-2">
                  {c.bags}
                </td>
              ))}
            </tr>
            <tr className="border-b border-rule-soft">
              <td className="py-0.5 pr-2">副反応があったバッグ</td>
              {counts.map((c) => (
                <td key={c.product} className="pr-2">
                  {c.reactions}
                </td>
              ))}
            </tr>
            {SYMPTOMS.filter((s) => counts.some((c) => c.symptoms[s])).map((s) => (
              <tr key={s} className="border-b border-rule-soft">
                <td className="py-0.5 pr-2">　{s}</td>
                {counts.map((c) => (
                  <td key={c.product} className="pr-2">
                    {c.symptoms[s] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-ink-soft">
          件数の数え方：
          <a href={BLOOD_SOURCES.reportForm.url} target="_blank" rel="noreferrer" className="text-ai underline">
            {BLOOD_SOURCES.reportForm.label}
          </a>
          。症状の項目：
          <a href={BLOOD_SOURCES.symptoms.url} target="_blank" rel="noreferrer" className="text-ai underline">
            {BLOOD_SOURCES.symptoms.label}
          </a>
        </p>
      </div>
      <SourceNote rules={[BLOOD_RULES.reaction]} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 使用記録（20年）
// ---------------------------------------------------------------------------

export function BloodRecords({ bank, people, today }: BloodBankProps) {
  const rows = usageRecords(bank, (pid) => {
    const x = people.find((y) => y.patient.id === pid);
    return x ? { name: x.patient.name, address: null } : undefined;
  }, today);
  return (
    <section className="space-y-3">
      <table className={`${bbCard} w-full border-collapse text-[12px]`}>
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1 font-normal">使用した日</th>
            <th className="px-2 py-1 font-normal">氏名（ID）</th>
            <th className="px-2 py-1 font-normal">住所</th>
            <th className="px-2 py-1 font-normal">製剤の名称</th>
            <th className="px-2 py-1 font-normal">製造番号</th>
            <th className="px-2 py-1 font-normal">保存の期限</th>
            <th className="px-2 py-1 font-normal">足りない項目</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-2 py-3 text-center text-ink-faint">
                まだ輸血の記録はありません（病棟で輸血を始めると、バッグごとにここに入ります）。
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.lot} className="border-b border-rule-soft align-top">
              <td className="nums px-2 py-1">{isoDate(r.used)}</td>
              <td className="px-2 py-1">
                {r.name}（{r.patientId}）{r.reaction && <b className="ml-1 text-shu">副反応あり</b>}
              </td>
              <td className="px-2 py-1 text-ink-soft">{r.address ?? "患者基本情報から（この試作の架空の患者には住所がない）"}</td>
              <td className="px-2 py-1">{r.product}</td>
              <td className="nums px-2 py-1 font-mono">{r.lot}</td>
              <td className="nums px-2 py-1">{isoDate(r.keep)} まで</td>
              <td className={`px-2 py-1 ${r.missing.length ? "font-bold text-shu" : "text-wakatake"}`}>{r.missing.length ? r.missing.join("・") : "なし"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint rounded-md border border-rule bg-sheet p-3 text-[11px] text-ink-soft">
        <p>{BLOOD_RULES.records}</p>
        <p className="mt-1">
          出典：
          {[BLOOD_SOURCES.law, BLOOD_SOURCES.rule, BLOOD_SOURCES.guide].map((s, i) => (
            <span key={s.url}>
              {i > 0 && "／"}
              <a href={s.url} target="_blank" rel="noreferrer" className="text-ai underline">
                {s.label}
              </a>
            </span>
          ))}
        </p>
        <p className="mt-1">この試作の記録はこのブラウザ（設定すれば記録の保存先）にあり、20年の保存はしていません。保存の期限はコードが使用した日から数えて出します。</p>
      </div>
    </section>
  );
}
