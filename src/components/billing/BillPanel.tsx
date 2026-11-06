"use client";

import { displayText } from "@/lib/display-text";
import type { Insurance } from "@/lib/billing/insurance";
import type { Bill } from "@/lib/billing/kaikei";
import type { ClaimResult } from "@/lib/billing/model";

const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;
const pts = (n: number) => `${n.toLocaleString("ja-JP")}点`;

/** The month's bill at the window: what the patient pays, and how it was computed. */
export function BillPanel({ claim, bill, insurance, month }: { claim: ClaimResult; bill: Bill; insurance: Insurance & { assumed?: boolean }; month: string }) {
  const [y, m] = month.split("-").map(Number);
  const meals = claim.meals;
  return (
    <div className="nums grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-label="領収金額" className="rounded-md border border-rule bg-paper p-4">
        <h3 className="mb-2 text-sm font-bold">
          {y}年{m}月分（{displayText(claim.from ? `${m}/${claim.from}〜${m}/${claim.to}` : "入院日なし")}・{claim.days}日）
        </h3>
        <table className="w-full text-sm">
          <tbody>
            {bill.sections.map((s) => (
              <tr key={s.name} className="border-b border-rule-soft">
                <th className="py-1 text-left font-normal text-ink-soft">{s.name}</th>
                <td className="py-1 text-right">{pts(s.points)}</td>
              </tr>
            ))}
            <tr className="border-b border-rule">
              <th className="py-1 text-left">合計点数</th>
              <td className="py-1 text-right font-bold">{pts(bill.totalPoints)}</td>
            </tr>
            <tr className="border-b border-rule-soft">
              <th className="py-1 text-left font-normal text-ink-soft">医療費（1点10円）</th>
              <td className="py-1 text-right">{yen(bill.medicalCostYen)}</td>
            </tr>
            <tr className="border-b border-rule-soft">
              <th className="py-1 text-left font-normal text-ink-soft">一部負担金（{bill.rate / 10}割、10円未満四捨五入）</th>
              <td className={`py-1 text-right ${bill.kogaku ? "text-ink-faint line-through" : ""}`}>{yen(bill.ichibuYen)}</td>
            </tr>
            {bill.limit && (
              <tr className="border-b border-rule-soft">
                <th className="py-1 text-left font-normal text-ink-soft">
                  自己負担限度額（{insurance.incomeClass}）
                  <div className="text-[11px] text-ink-faint">{bill.limit.formula}</div>
                </th>
                <td className="py-1 text-right">{yen(bill.limit.yen)}</td>
              </tr>
            )}
            <tr className="border-b border-rule">
              <th className="py-1 text-left">医療の負担（窓口）</th>
              <td className="py-1 text-right font-bold">{yen(bill.medicalYen)}</td>
            </tr>
            <tr className="border-b border-rule-soft">
              <th className="py-1 text-left font-normal text-ink-soft">
                食事療養 標準負担額
                <div className="text-[11px] text-ink-faint">高額療養費の計算には入りません</div>
              </th>
              <td className="py-1 text-right">{yen(meals.futanYen)}</td>
            </tr>
            <tr>
              <th className="py-2 text-left text-base">お支払い</th>
              <td className="py-2 text-right text-xl font-bold">{yen(bill.totalYen)}</td>
            </tr>
          </tbody>
        </table>
        {bill.kogaku && (
          <p className="mt-2 rounded border border-wakatake/40 bg-wakatake-soft px-2 py-1 text-xs text-wakatake">
            高額療養費 {yen(bill.kogakuYen)} は保険者から病院に払われます（窓口で差し引き済み・現物給付）。
          </p>
        )}
        {bill.notes.map((n) => (
          <p key={n} className="mt-2 rounded border border-yamabuki/40 bg-yamabuki-soft px-2 py-1 text-xs text-yamabuki">
            {n}
          </p>
        ))}
      </section>

      <section aria-label="保険" className="space-y-3 text-sm">
        <div className="rounded-md border border-rule bg-sheet p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
            保険

            {insurance.assumed && <span className="rounded bg-yamabuki-soft px-1.5 py-0.5 text-[10px] font-normal text-yamabuki">年齢からの仮の保険</span>}
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-ink-faint">種類</dt>
            <dd>
              {insurance.kind}（{insurance.relation}）
            </dd>
            <dt className="text-ink-faint">保険者番号</dt>
            <dd>{insurance.insurerNumber}</dd>
            <dt className="text-ink-faint">記号・番号</dt>
            <dd>
              {insurance.symbol ? `${insurance.symbol}・` : ""}
              {insurance.number}
              {insurance.branch ? `（枝番 ${insurance.branch}）` : ""}
            </dd>
            <dt className="text-ink-faint">負担割合</dt>
            <dd>{insurance.rate / 10}割</dd>
            <dt className="text-ink-faint">所得区分</dt>
            <dd>
              {insurance.incomeClass}
              {insurance.limitKnown ? "（窓口で適用区分がわかる）" : "（適用区分の提示なし）"}
            </dd>
            <dt className="text-ink-faint">食事の標準負担額</dt>
            <dd>{insurance.mealClass}</dd>
          </dl>
        </div>
        <div className="rounded-md border border-rule bg-sheet p-4 text-xs text-ink-soft">
          <h3 className="mb-1 text-sm font-bold text-ink">入院時食事療養</h3>
          <p>
            食事療養費 {yen(meals.ryoyoYen)}（病院が受け取る額）のうち、患者の負担は標準負担額 {yen(meals.futanYen)}。残りは保険から払われます。
          </p>
        </div>
        <p className="text-[11px] text-ink-faint">
          計算は医療機関の窓口の分だけです（同じ月の他の医療機関や世帯の合算、月をまたぐ多数回該当は、あとで保険者が払い戻します）。
        </p>
      </section>
    </div>
  );
}
