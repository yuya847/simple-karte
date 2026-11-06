"use client";

import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import {
  BLOOD_RULES,
  DISCARD_REASONS,
  RETURN_RULE,
  bagLabel,
  momentOf,
  momentText,
  productName,
  returnOutcome,
  typeText,
  typingProblems,
  unitState,
  type Abo,
  type BloodState,
  type BloodUnit,
  type DiscardReason,
  type Moment,
  type Product,
  type Rh,
} from "@/lib/blood-bank";
import { addDays, daysFrom, isoDate } from "@/lib/dates";
import { TX_PRODUCTS } from "@/lib/procedures";
import { useDeny, useMe } from "./RoleContext";
import { SampleInput, SourceNote, bbCard, bbField, type BloodBankProps } from "./BloodBankView";

const ABOS: Abo[] = ["A", "B", "O", "AB"];

// ---------------------------------------------------------------------------
// 血液型・不規則抗体
// ---------------------------------------------------------------------------

export function BloodTyping({ people, bank, onBank, stateOf, nowAbs }: BloodBankProps & { stateOf: (pid: string) => BloodState; nowAbs: number }) {
  const me = useMe();
  const deny = useDeny()("blood.bank");
  const [pid, setPid] = useState(people[0]?.patient.id ?? "");
  const [sample, setSample] = useState<Moment>({ day: 0, time: "" });
  const [abo, setAbo] = useState<Abo>("A");
  const [rh, setRh] = useState<Rh>("+");
  const [match, setMatch] = useState(true);
  const [antibody, setAntibody] = useState<"" | "陰性" | "陽性">("陰性");
  const [abName, setAbName] = useState("");
  const [checker, setChecker] = useState("");
  const who = people.find((x) => x.patient.id === pid);
  const problems = typingProblems({ by: me.name, checkedBy: checker, sample }, nowAbs);
  const record = () => {
    if (!who || problems.length) return;
    const t = { id: crypto.randomUUID(), patientId: pid, sample, abo, rh, frontBackMatch: match, ...(antibody ? { antibody } : {}), ...(antibody === "陽性" && abName.trim() ? { antibodyName: abName.trim() } : {}), by: me.name, checkedBy: checker.trim(), at: momentOf(nowAbs) };
    onBank((b) => ({ ...b, typings: [...b.typings, t] }));
    auditLog({ role: me.role, actor: me.name, action: "確定（血液型・不規則抗体の検査）", patient: who.patient.name, detail: `検体 ${momentText(sample)}　${typeText(abo, rh)}${match ? "" : "（オモテ・ウラ不一致）"}　不規則抗体 ${antibody || "未実施"}${abName ? `（${abName}）` : ""}　確認 ${checker.trim()}` });
    setSample({ day: 0, time: "" });
    setAbName("");
  };
  return (
    <section className="space-y-3">
      <table className={`${bbCard} w-full border-collapse text-[12px]`}>
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1 font-normal">患者</th>
            <th className="px-2 py-1 font-normal">血液型</th>
            <th className="px-2 py-1 font-normal">確認</th>
            <th className="px-2 py-1 font-normal">不規則抗体</th>
            <th className="px-2 py-1 font-normal">この画面の記録</th>
          </tr>
        </thead>
        <tbody>
          {people.map((x) => {
            const s = stateOf(x.patient.id);
            const mine = bank.typings.filter((t) => t.patientId === x.patient.id);
            return (
              <tr key={x.patient.id} className="border-b border-rule-soft align-top">
                <td className="px-2 py-1">
                  {x.room}　{x.patient.name}
                </td>
                <td className="px-2 py-1">{displayText(s.abo ? typeText(s.abo, s.rh!) : "未検査")}</td>
                <td className={`px-2 py-1 ${s.confirmed ? "text-wakatake" : "font-bold text-shu"}`}>
                  {s.samples}回{s.confirmed ? "（確定）" : "（2回目の検体が要る）"}
                  {s.conflict && <span className="block">{s.conflict}</span>}
                </td>
                <td className={`px-2 py-1 ${s.antibody === "陽性" ? "font-bold text-shu" : ""}`}>
                  {s.antibody ?? "未検査"}
                  {s.antibodies.length > 0 && `（${s.antibodies.join("・")}）`}
                </td>
                <td className="px-2 py-1 text-ink-soft">
                  {mine.map((t) => (
                    <span key={t.id} className="block">
                      検体 {displayText(momentText(t.sample))}：{displayText(typeText(t.abo, t.rh))}
                      {t.frontBackMatch ? "" : "（オモテ・ウラ不一致）"}・抗体 {t.antibody ?? "—"}　{displayText(t.by)}／{t.checkedBy}
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          record();
        }}
        className={`${bbCard} flex flex-wrap items-center gap-2 p-3 text-[12px]`}
      >
        <b className="w-full">検査の結果を入れる</b>
        <select value={pid} onChange={(e) => setPid(e.target.value)} aria-label="患者" className={bbField} disabled={!!deny}>
          {people.map((x) => (
            <option key={x.patient.id} value={x.patient.id}>
              {x.room} {x.patient.name}
            </option>
          ))}
        </select>
        <SampleInput value={sample} onChange={setSample} />
        <label className="flex items-center gap-1">
          ABO
          <select value={abo} onChange={(e) => setAbo(e.target.value as Abo)} className={bbField} disabled={!!deny}>
            {ABOS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          RhD
          <select value={rh} onChange={(e) => setRh(e.target.value as Rh)} className={bbField} disabled={!!deny}>
            <option value="+">陽性（+）</option>
            <option value="-">陰性（−）</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={match} onChange={(e) => setMatch(e.target.checked)} disabled={!!deny} />
          オモテ検査とウラ検査が一致
        </label>
        <label className="flex items-center gap-1">
          不規則抗体
          <select value={antibody} onChange={(e) => setAntibody(e.target.value as "" | "陰性" | "陽性")} className={bbField} disabled={!!deny}>
            <option value="">この検体ではしていない</option>
            <option>陰性</option>
            <option>陽性</option>
          </select>
        </label>
        {antibody === "陽性" && <input value={abName} onChange={(e) => setAbName(e.target.value)} placeholder="同定した抗体（例：抗E）" aria-label="同定した抗体" className={`${bbField} w-40`} disabled={!!deny} />}
        <input value={checker} onChange={(e) => setChecker(e.target.value)} placeholder="2人目の技師" aria-label="2人目の技師" className={`${bbField} w-32`} disabled={!!deny} />
        <button type="submit" disabled={!!deny || problems.length > 0 || !who} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
          記録する
        </button>
        {problems.length > 0 && <span className="w-full text-ink-soft">{problems.join(" ")}</span>}
      </form>
      <SourceNote rules={[BLOOD_RULES.typing, BLOOD_RULES.antibody]} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 在庫（入庫・廃棄）
// ---------------------------------------------------------------------------

export function BloodStock({ bank, onBank, nowAbs, today, people }: BloodBankProps & { nowAbs: number }) {
  const me = useMe();
  const deny = useDeny()("blood.bank");
  const [lot, setLot] = useState("");
  const [product, setProduct] = useState<Product>("RBC");
  const [units, setUnits] = useState(2);
  const [abo, setAbo] = useState<Abo>("A");
  const [rh, setRh] = useState<Rh>("+");
  const [expires, setExpires] = useState("");
  const [irradiated, setIrradiated] = useState(true);
  const [checked, setChecked] = useState(false);
  const [discard, setDiscard] = useState<Record<string, DiscardReason>>({});
  const at = momentOf(nowAbs);
  const expDay = expires ? daysFrom(today, { y: Number(expires.slice(0, 4)), m: Number(expires.slice(5, 7)), d: Number(expires.slice(8, 10)) }) : null;
  const problems = [
    !lot.trim() && "製造番号",
    bank.units.some((u) => u.lot === lot.trim()) && "同じ製造番号がもう入庫されています",
    expDay === null && "有効期限",
    expDay !== null && expDay < 0 && "有効期限が過ぎています",
    !checked && "納品伝票と製剤本体の照合・外観の確認",
  ].filter((x): x is string => !!x);
  const receive = () => {
    if (problems.length || expDay === null) return;
    const u: BloodUnit = { lot: lot.trim(), product, units, abo, rh, expires: { day: expDay, time: "23:59" }, irradiated: product === "FFP" ? false : irradiated, received: { ...at, by: me.name } };
    onBank((b) => ({ ...b, units: [...b.units, u] }));
    auditLog({ role: me.role, actor: me.name, action: "確定（血液製剤の入庫）", detail: `${productName(product)} ${bagLabel(u)} ${typeText(abo, rh)}　製造番号 ${u.lot}　期限 ${expires}` });
    setLot("");
    setChecked(false);
  };
  const set = (l: string, f: (u: BloodUnit) => BloodUnit) => onBank((b) => ({ ...b, units: b.units.map((u) => (u.lot === l ? f(u) : u)) }));
  const nameOf = (pid?: string) => people.find((x) => x.patient.id === pid)?.patient.name ?? pid ?? "";
  // Bags already transfused are in 使用記録, not in stock.
  const shown = bank.units.filter((u) => !u.discarded && !bank.admins[u.lot]?.start).sort((a, b) => a.product.localeCompare(b.product) || a.abo.localeCompare(b.abo) || abs2(a.expires) - abs2(b.expires));
  const gone = bank.units.filter((u) => u.discarded);
  const counts = (["RBC", "FFP", "PC"] as Product[]).map((pr) => ({
    pr,
    by: ABOS.flatMap((a) => (["+", "-"] as Rh[]).map((r) => ({ t: typeText(a, r), n: bank.units.filter((u) => u.product === pr && u.abo === a && u.rh === r && unitState(u, bank.admins, nowAbs) === "在庫").reduce((s, u) => s + u.units, 0) }))).filter((x) => x.n > 0),
  }));
  return (
    <section className="space-y-3">
      <div className={`${bbCard} p-3 text-[12px]`}>
        <b>在庫（割付のない製剤の単位数）</b>
        {counts.map((c) => (
          <p key={c.pr} className="nums">
            {TX_PRODUCTS[c.pr].short}：{displayText(c.by.length ? c.by.map((x) => `${x.t} ${x.n}単位`).join("　") : "なし")}
          </p>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          receive();
        }}
        className={`${bbCard} flex flex-wrap items-center gap-2 p-3 text-[12px]`}
      >
        <b className="w-full">入庫（血液センターから届いた製剤）</b>
        <input value={lot} onChange={(e) => setLot(e.target.value)} placeholder="製造番号（バーコード）" aria-label="製造番号" className={`${bbField} nums w-40 font-mono`} disabled={!!deny} />
        <select
          value={product}
          onChange={(e) => {
            const pr = e.target.value as Product;
            setProduct(pr);
            setUnits(bagUnits(pr)[0]);
            setIrradiated(pr !== "FFP");
          }}
          aria-label="製剤"
          className={bbField}
          disabled={!!deny}
        >
          {(["RBC", "FFP", "PC"] as Product[]).map((pr) => (
            <option key={pr} value={pr}>
              {productName(pr)}
            </option>
          ))}
        </select>
        <select value={units} onChange={(e) => setUnits(Number(e.target.value))} aria-label="単位" className={bbField} disabled={!!deny}>
          {bagUnits(product).map((n) => (
            <option key={n} value={n}>
              {bagLabel({ product, units: n })}
            </option>
          ))}
        </select>
        <select value={abo} onChange={(e) => setAbo(e.target.value as Abo)} aria-label="ABO" className={bbField} disabled={!!deny}>
          {ABOS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select value={rh} onChange={(e) => setRh(e.target.value as Rh)} aria-label="RhD" className={bbField} disabled={!!deny}>
          <option value="+">Rh(+)</option>
          <option value="-">Rh(−)</option>
        </select>
        <label className="flex items-center gap-1">
          有効期限
          <input type="date" value={expires} min={isoDate(today)} onChange={(e) => setExpires(e.target.value)} className={`${bbField} nums`} disabled={!!deny} />
        </label>
        {product !== "FFP" && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={irradiated} onChange={(e) => setIrradiated(e.target.checked)} disabled={!!deny} />
            放射線照射済み
          </label>
        )}
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={!!deny} />
          納品伝票と製剤本体を照合し、外観に異常がない
        </label>
        <button type="submit" disabled={!!deny || problems.length > 0} className="rounded bg-ai px-3 py-0.5 font-bold text-white disabled:opacity-40">
          入庫する
        </button>
        {problems.length > 0 && <span className="w-full text-ink-soft">足りないこと：{problems.join("、")}</span>}
      </form>

      <table className={`${bbCard} w-full border-collapse text-[12px]`}>
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1 font-normal">製造番号</th>
            <th className="px-2 py-1 font-normal">製剤</th>
            <th className="px-2 py-1 font-normal">血液型</th>
            <th className="px-2 py-1 font-normal">有効期限</th>
            <th className="px-2 py-1 font-normal">状態</th>
            <th className="px-2 py-1 font-normal">製剤の ABO 確認</th>
            <th className="px-2 py-1 font-normal">廃棄</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((u) => {
            const st = unitState(u, bank.admins, nowAbs);
            const left = Math.floor((abs2(u.expires) - nowAbs) / 1440);
            const canDiscard = st === "在庫" || st === "期限切れ" || st === "割付済み";
            return (
              <tr key={u.lot} className={`border-b border-rule-soft align-top ${st === "期限切れ" ? "bg-shu-soft" : ""}`}>
                <td className="nums px-2 py-1 font-mono">{u.lot}</td>
                <td className="px-2 py-1">
                  {TX_PRODUCTS[u.product].short} {bagLabel(u)}
                  {u.product !== "FFP" && !u.irradiated && <b className="ml-1 text-shu">未照射</b>}
                </td>
                <td className="px-2 py-1">{displayText(typeText(u.abo, u.rh))}</td>
                <td className={`nums px-2 py-1 ${st === "期限切れ" ? "font-bold text-shu" : left <= 2 ? "font-bold text-yamabuki" : ""}`}>
                  {isoDate(addDays(today, u.expires.day))}
                  {st === "期限切れ" ? "（過ぎた）" : `（あと${left}日）`}
                </td>
                <td className="px-2 py-1">
                  {st}
                  {u.assigned && <span className="block text-ink-soft">{nameOf(u.assigned.patientId)}さん</span>}
                  {u.returned && <span className="block text-ink-soft">返却 {u.returned.time}（{u.returned.outcome}）</span>}
                </td>
                <td className="px-2 py-1">
                  {u.aboChecked ? (
                    <span className="text-wakatake">
                      確認 {u.aboChecked.time} {displayText(u.aboChecked.by)}
                    </span>
                  ) : u.product === "RBC" && st !== "期限切れ" ? (
                    <button
                      type="button"
                      disabled={!!deny}
                      onClick={() => {
                        set(u.lot, (x) => ({ ...x, aboChecked: { ...at, by: me.name } }));
                        auditLog({ role: me.role, actor: me.name, action: "確定（製剤の ABO 確認）", detail: `製造番号 ${u.lot}　${typeText(u.abo, u.rh)}` });
                      }}
                      className="rounded border border-ai px-1.5 text-ai disabled:opacity-40"
                    >
                      オモテ検査で確認した
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1">
                  {canDiscard && (
                    <span className="flex items-center gap-1">
                      <select value={discard[u.lot] ?? (st === "期限切れ" ? "有効期限切れ" : "外観の異常")} onChange={(e) => setDiscard({ ...discard, [u.lot]: e.target.value as DiscardReason })} aria-label="廃棄の理由" className={bbField} disabled={!!deny}>
                        {DISCARD_REASONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!!deny}
                        onClick={() => {
                          const reason = discard[u.lot] ?? (st === "期限切れ" ? "有効期限切れ" : "外観の異常");
                          set(u.lot, (x) => ({ ...x, discarded: { ...at, by: me.name, reason } }));
                          auditLog({ role: me.role, actor: me.name, action: "確定（血液製剤の廃棄）", detail: `製造番号 ${u.lot}　${productName(u.product)} ${bagLabel(u)}　理由：${reason}` });
                        }}
                        className={`rounded px-1.5 ${st === "期限切れ" ? "bg-shu font-bold text-white" : "border border-rule text-ink-soft"} disabled:opacity-40`}
                      >
                        廃棄した
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {gone.length > 0 && (
        <div className={`${bbCard} p-3 text-[12px]`}>
          <b>廃棄の記録（廃棄処理伝票）</b>
          {gone.map((u) => (
            <p key={u.lot} className="nums">
              {u.discarded!.time} {displayText(u.discarded!.by)}　<span className="font-mono">{u.lot}</span>　{productName(u.product)} {bagLabel(u)} {displayText(typeText(u.abo, u.rh))}　理由：{displayText(u.discarded!.reason)}
            </p>
          ))}
        </div>
      )}
      <SourceNote rules={[BLOOD_RULES.receive, BLOOD_RULES.computer]} />
    </section>
  );
}

const abs2 = (m: Moment) => m.day * 1440 + Number(m.time.slice(0, 2)) * 60 + Number(m.time.slice(3, 5));
const bagUnits = (pr: Product) => [...new Set(pr === "RBC" ? [1, 2] : pr === "FFP" ? [2, 4] : TX_PRODUCTS.PC.units.map((u) => u.units))];

// ---------------------------------------------------------------------------
// 返却
// ---------------------------------------------------------------------------

export function BloodReturns({ bank, onBank, nowAbs, nowTime, people, onIssued }: BloodBankProps & { nowAbs: number }) {
  const me = useMe();
  const deny = useDeny()("blood.bank");
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const out = bank.units.filter((u) => unitState(u, bank.admins, nowAbs) === "払出済み");
  const returned = bank.units.filter((u) => u.returned);
  const nameOf = (pid?: string) => people.find((x) => x.patient.id === pid)?.patient.name ?? pid ?? "";
  const record = (u: BloodUnit) => {
    const appearanceOk = ok[u.lot] ?? true;
    const r = returnOutcome(u, nowAbs, appearanceOk);
    const at = momentOf(nowAbs);
    const orderId = u.assigned?.orderId;
    onBank((b) => ({
      ...b,
      units: b.units.map((x) => {
        if (x.lot !== u.lot) return x;
        const back = { ...x, returned: { ...at, by: me.name, minutesOut: r.minutesOut, appearanceOk, outcome: r.outcome } };
        if (r.outcome === "廃棄") return { ...back, discarded: { ...at, by: me.name, reason: "返却（使えない）" as const, note: r.why } };
        delete back.assigned;
        delete back.issued;
        delete back.crossmatch;
        return back;
      }),
    }));
    if (orderId) {
      const still = bank.units.filter((x) => x.lot !== u.lot && x.assigned?.orderId === orderId && x.issued && !x.discarded).map((x) => x.lot);
      onIssued(orderId, still.length ? { lot: still.join("・"), at: nowTime, by: me.name } : null);
    }
    auditLog({ role: me.role, actor: me.name, action: "確定（血液製剤の返却）", patient: nameOf(u.assigned?.patientId), detail: `製造番号 ${u.lot}　${r.outcome}：${r.why}` });
  };
  return (
    <section className="space-y-3">
      {out.length === 0 && <p className={`${bbCard} px-4 py-3 text-ink-soft`}>払い出して、まだ輸血を始めていない製剤はありません。</p>}
      {out.map((u) => {
        const r = returnOutcome(u, nowAbs, ok[u.lot] ?? true);
        return (
          <article key={u.lot} className={`${bbCard} flex flex-wrap items-center gap-3 p-3 text-[12px]`}>
            <span className="font-mono font-bold">{u.lot}</span>
            <span>
              {productName(u.product)} {bagLabel(u)} {displayText(typeText(u.abo, u.rh))}
            </span>
            <span className="text-ink-soft">
              {nameOf(u.assigned?.patientId)}さん　払出 {u.issued!.time}（{u.issued!.to}）
            </span>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={ok[u.lot] ?? true} onChange={(e) => setOk({ ...ok, [u.lot]: e.target.checked })} disabled={!!deny} />
              外観に異常なし
            </label>
            <span className={r.outcome === "廃棄" ? "font-bold text-shu" : "font-bold text-wakatake"}>
              いま戻すと：{r.outcome === "廃棄" ? "廃棄" : "在庫に戻す"}（{r.why}）
            </span>
            <button type="button" disabled={!!deny} onClick={() => record(u)} className="ml-auto rounded bg-ai px-2 py-0.5 font-bold text-white disabled:opacity-40">
              戻ったことを記録
            </button>
          </article>
        );
      })}
      {returned.length > 0 && (
        <div className={`${bbCard} p-3 text-[12px]`}>
          <b>返却の記録</b>
          {returned.map((u) => (
            <p key={u.lot} className="nums">
              {displayText(momentText(u.returned!))} {displayText(u.returned!.by)}　<span className="font-mono">{u.lot}</span>　払出から{u.returned!.minutesOut}分　外観 {u.returned!.appearanceOk ? "異常なし" : "異常あり"}　→ {u.returned!.outcome}
            </p>
          ))}
        </div>
      )}
      <SourceNote rules={[RETURN_RULE.text, BLOOD_RULES.roomTime]} />
    </section>
  );
}
