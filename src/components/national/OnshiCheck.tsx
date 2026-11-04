"use client";

// 「資格を確認（模擬）」: asks the SIMULATED オンライン資格確認 (adapter.ts) and shows the answer in the items the
// public documents name. From 保険の登録 the answer can be copied into the form; from the 外来受付 it marks
// the 資格 as checked. Nothing is preselected: the window chooses how the patient came (マイナ保険証 or
// 資格確認書) and what the patient agreed to at the card reader.

import { IdCard } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import type { InsuranceForm } from "@/lib/billing/registration";
import type { CalendarDate } from "@/lib/dates";
import { nationalServices } from "@/lib/national/adapter";
import { CHECKUP_ITEMS, formFromQualification, LIMIT_CLASS_CODES, ONSHI_SOURCES, ONSHI_UNFILLED, type CardQuery, type CopiedForm, type OnshiPerson, type OnshiResult } from "@/lib/national/onshi";
import { useMe } from "../RoleContext";
import { MockMark, MockNote, SpecBox } from "./SpecParts";

const STATUS_CLS: Record<OnshiResult["status"], string> = { 有効: "bg-wakatake-soft text-wakatake", 無効: "bg-shu-soft text-shu", 該当資格なし: "bg-yamabuki-soft text-yamabuki" };

export function OnshiCheck({
  person,
  today,
  nowTime,
  card,
  body,
  locked,
  current,
  onCopy,
  onChecked,
  compact,
}: {
  person: OnshiPerson | null;
  today: CalendarDate;
  nowTime: string;
  /** What 保険の登録 has typed (for an inquiry with the 資格確認書). */
  card?: CardQuery;
  body?: { heightCm?: number; weightKg?: number };
  locked?: string | null;
  /** The form now, kept where the answer has nothing (保険の登録). */
  current?: InsuranceForm;
  onCopy?: (c: CopiedForm) => void;
  onChecked?: (r: OnshiResult) => void;
  compact?: boolean;
}) {
  const me = useMe();
  const [how, setHow] = useState<OnshiResult["how"] | "">("");
  const [consent, setConsent] = useState({ drugs: false, checkups: false, limit: false });
  const [result, setResult] = useState<OnshiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = !!person && !!how && !locked && !busy;

  const ask = async () => {
    if (!ready || !person || !how) return;
    setBusy(true);
    const r = await nationalServices.checkQualification({ person, consent, how, card, body, today, time: nowTime });
    setBusy(false);
    setResult(r);
    auditLog({ role: me.role, actor: me.name, action: "オンライン資格確認（模擬）", patient: person.name, detail: `${how}・${r.status}${r.drugs ? "・薬剤情報" : ""}${r.checkups ? "・特定健診情報" : ""}` });
    onChecked?.(r);
  };

  const info = result?.info;
  const copied = info && onCopy ? formFromQualification(info, today, current) : null;
  const limitLabel = (code: string) => LIMIT_CLASS_CODES.find((x) => x.code === code)?.label ?? code;
  const ymd = (s: string) => s || "—";

  return (
    <section aria-label="オンライン資格確認（模擬）" className="space-y-2 rounded-md border border-dashed border-shu/40 bg-sheet p-3 text-xs">
      <h3 className="flex flex-wrap items-center gap-1 text-sm font-bold">
        <IdCard size={15} />
        オンライン資格確認
        <MockMark />
      </h3>
      <MockNote>オンライン資格確認等システムにはつないでいません（回線・証明書・契約が要るため）。答えは架空で、項目は公開資料にあるものです。</MockNote>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ink-soft">受け付けたもの</span>
        {(["マイナ保険証", "資格確認書"] as const).map((h) => (
          <label key={h} className="flex items-center gap-1">
            <input type="radio" name={`onshi-how-${person?.id ?? "new"}`} checked={how === h} onChange={() => (setHow(h), setResult(null))} disabled={!!locked} />
            {h === "マイナ保険証" ? "マイナ保険証（顔認証付きカードリーダー）" : "資格確認書（券面の番号で照会）"}
          </label>
        ))}
      </div>
      {how === "マイナ保険証" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-ink-soft">患者がカードリーダーで同意したもの</span>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={consent.drugs} onChange={(e) => setConsent((c) => ({ ...c, drugs: e.target.checked }))} disabled={!!locked} />
            診療・お薬（薬剤情報）
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={consent.checkups} onChange={(e) => setConsent((c) => ({ ...c, checkups: e.target.checked }))} disabled={!!locked} />
            健診（特定健診情報）
          </label>
          <span className="text-[10px] text-ink-faint">限度額の情報は同意の画面なしで返ります（2024年10月7日から）。同意は24時間有効です。</span>
        </div>
      )}
      {how === "資格確認書" && (
        <div className="space-y-1">
          <p className="nums text-ink-soft">照会する番号：保険者番号 {card?.insurerNumber || "—"}・記号 {card?.symbol || "—"}・番号 {card?.number || "—"}・枝番 {card?.branch || "（なし）"}・生年月日 {card?.birthDate || "—"}<span className="hint">（保険の登録の欄に入れた値で照会します）</span></p>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={consent.limit} onChange={(e) => setConsent((c) => ({ ...c, limit: e.target.checked }))} disabled={!!locked} />
            限度額の情報の提供に、患者が同意した
          </label>
          <p className="text-[10px] text-ink-faint">資格確認書では薬剤情報・特定健診情報は見られません（マイナ保険証での本人確認と同意が要る）。</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={ask} disabled={!ready} className="rounded-md bg-ai px-3 py-1 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? "確認しています…" : "資格を確認（模擬）"}
        </button>
        {!person && <span className="text-ink-faint">氏名・カナ・性別・年齢を入れると確認できます。</span>}
        {locked && <span className="text-ink-faint">{locked}</span>}
      </div>

      {result && (
        <div className="space-y-2 rounded border border-rule bg-paper p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 font-bold ${STATUS_CLS[result.status]}`}>{result.status}</span>
            <span className="nums text-ink-faint">
              {result.checkedAt} 照会番号 {result.queryNo}（{result.how}）
            </span>
          </div>
          {result.reason && <p className="text-yamabuki">{result.reason}</p>}
          {info && (
            <dl className="nums grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 sm:grid-cols-[auto_1fr_auto_1fr]">
              {(
                [
                  ["氏名", `${info.name}（${info.kana}）`],
                  ["性別・生年月日", `${info.sex}・${info.birthDate}`],
                  ["保険者番号", `${info.insurerNumber}（${info.insurerName}）`],
                  ["記号・番号・枝番", `${info.symbol || "（記号なし）"}・${info.number}・${info.branch || "（なし）"}`],
                  ["本人・家族の別", info.relation ?? "（後期高齢者医療は設定なし）"],
                  ...(info.insuredName ? [["被保険者氏名", info.insuredName]] : []),
                  ["資格取得年月日", info.acquired],
                  ["被保険者証区分", `${info.card.kind}（有効 ${ymd(info.card.validFrom)}〜${ymd(info.card.validTo)}）`],
                  ...(info.card.rate ? [["一部負担金割合（被保険者証）", `${info.card.rate / 10}割`]] : []),
                  ...(info.elder ? [["高齢受給者証", `${info.elder.rate / 10}割（${info.elder.validFrom}〜${info.elder.validTo}）`]] : []),
                  ...(info.limit ? [["限度額適用認定証関連情報", `${info.limit.kind}・適用区分 ${info.limit.classCode} ${limitLabel(info.limit.classCode)}（${info.limit.validFrom}〜${info.limit.validTo}）`]] : []),
                  ["住所", info.address || "（記録なし）"],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-faint">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {result.notGiven.length > 0 && <p className="text-[11px] text-ink-faint">返らなかったもの：{result.notGiven.join("、")}</p>}

          {result.drugs && (
            <div>
              <h4 className="mb-0.5 font-bold text-ink-soft">薬剤情報（ほかの医療機関・薬局。架空）</h4>
              {result.drugs.length === 0 ? (
                <p className="text-ink-faint">記録はありません。</p>
              ) : (
                <table className="nums w-full text-[11px]">
                  <thead className="text-left text-ink-faint">
                    <tr>
                      <th>処方年月日</th>
                      <th>医療機関・薬局</th>
                      <th>区分</th>
                      <th>医薬品名（成分名）</th>
                      <th>用法・1回量</th>
                      <th>調剤数量</th>
                      <th>元</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.drugs.map((d, i) => (
                      <tr key={i} className="border-t border-rule-soft align-top">
                        <td>{d.date}</td>
                        <td>
                          {d.pharmacy}（{d.institution}）
                        </td>
                        <td>
                          {d.rxKind}・{d.use}
                        </td>
                        <td>
                          {d.drug}
                          {d.ingredient && <span className="text-ink-faint">（{d.ingredient}）</span>}
                        </td>
                        <td>
                          {d.usage}・1回{d.perDose}
                        </td>
                        <td>{d.quantity}</td>
                        <td>{d.via}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-0.5 text-[10px] text-ink-faint">レセプトからの情報は診療から10〜40日ほどあとに見られるようになります。電子処方箋の調剤情報は調剤した日から見られます。</p>
            </div>
          )}

          {result.checkups && (
            <div>
              <h4 className="mb-0.5 font-bold text-ink-soft">特定健診情報（架空）</h4>
              {result.checkups.length === 0 ? (
                <p className="text-ink-faint">40歳未満のため記録はありません。</p>
              ) : (
                <table className="nums text-[11px]">
                  <thead className="text-ink-faint">
                    <tr>
                      <th className="pr-3 text-left">項目</th>
                      {result.checkups.map((c) => (
                        <th key={c.date} className="pr-3 text-left">
                          {c.date}
                          <span className="block font-normal">{c.kind}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CHECKUP_ITEMS.map((it) => (
                      <tr key={it.label} className="border-t border-rule-soft">
                        <td className="pr-3 text-ink-soft">
                          {it.label}
                          {it.unit && <span className="text-ink-faint">（{it.unit}）</span>}
                        </td>
                        {result.checkups!.map((c) => (
                          <td key={c.date} className="pr-3">
                            {c.values[it.label] ?? "－"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {copied && (
            <div className="space-y-1 border-t border-rule pt-2">
              <button type="button" onClick={() => onCopy?.(copied)} disabled={!!locked} className="rounded-md border border-ai px-2.5 py-1 font-bold text-ai hover:bg-ai-soft disabled:opacity-40">
                保険の登録の欄に写す
              </button>
              <span className="hint ml-2 text-[11px] text-ink-soft">写したあと、左の欄とコードの確かめを見て「登録する」を押します。</span>
              {copied.derived.length > 0 && (
                <ul className="text-[11px] text-yamabuki">
                  {copied.derived.map((d) => (
                    <li key={d.field}>コードで入れた：{d.why}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {!compact && <SpecBox specs={ONSHI_SOURCES} unfilled={ONSHI_UNFILLED} />}
    </section>
  );
}
