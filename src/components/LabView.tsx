"use client";

import { BookOpenText, ClipboardPen, FlaskConical, HelpCircle, Microscope, PhoneCall, ScanLine } from "lucide-react";
import { useHints } from "@/lib/hints";
import { useRef, useState } from "react";
import { auditLog } from "@/lib/audit";
import { abs } from "@/lib/flowsheet";
import { cultureQueue } from "@/lib/lab-culture";
import { PLACE_NAME, drawRows, entryPlan, receive, redrawCode, rejectText, scanSpecimen, statusCounts, versionOf, whenText, type DrawRow, type DrawStatus, type LabDesk, type SpecimenScan } from "@/lib/lab-desk";
import type { AdminRecord } from "@/lib/mar";
import { callScript, hitLine, labBoard, placeOf, uncalled, type Ack, type PanicCall, type PanicLimit, type ResultItem } from "@/lib/results";
import { ANALYTES } from "@/lib/master";
import type { WorkPatient } from "@/lib/worksheet";
import { DenyNote, useDeny, useMe } from "./RoleContext";
import { LabCulture } from "./LabCulture";
import { LabEntry } from "./LabEntry";
import { PlaceMark } from "./LabMarks";
import { PanicCard } from "./PanicCard";

interface Props {
  /** The ward's patients, and today's visits of 救急外来・外来 with lab orders (ids "er:◯" / "opd:◯"). */
  people: WorkPatient[];
  /** Results of these patients (shown: from today on, and any panic value not reported yet). */
  items: ResultItem[];
  calls: Record<string, PanicCall>;
  /** The doctor's 確認 (with the response for a panic value), to check that someone acted. */
  acks: Record<string, Ack>;
  limits: PanicLimit[];
  limitsSource: string;
  nowTime: string;
  attending: string;
  onCall: (c: PanicCall) => void;
  /** 与薬・実施の記録: the ward records each draw there (ワークシートの照合). */
  records: Record<string, AdminRecord>;
  sessionStart: number;
  /** What the laboratory did in this session: samples taken in, results, tries to reach a doctor. */
  desk: LabDesk;
  onDesk: (f: (d: LabDesk) => LabDesk) => void;
}

type Tab = "receive" | "enter" | "culture" | "results";
const TABS: { key: Tab; label: string; icon: typeof ScanLine }[] = [
  { key: "receive", label: "検体の受付", icon: ScanLine },
  { key: "enter", label: "結果の入力", icon: ClipboardPen },
  { key: "culture", label: "培養", icon: Microscope },
  { key: "results", label: "結果とパニック値", icon: PhoneCall },
];

/** How to use each tab (the technologist's day), shown at the top (can be folded). */
const GUIDE: Record<Tab, string> = {
  receive:
    "今日と明日の朝（夜勤の終わる 9:00 まで）の病棟の採血・採尿と、今日の救急外来・外来の検体（「救急」「外来」の印）が時刻の順に並びます。病棟がワークシートの「照合」で採取を記録すると「採取済み」になります。届いた検体のラベルをバーコードリーダーで読むと（番号のあとに Enter が入ります）、コードがどの採血かを探して「受付済み」にし、時刻と受けた人を残します。一覧にない番号・中止の検査・受付済み・病棟が未実施と記録した採血・時刻より前で採取の記録もない採血・再採血を依頼した検体の古いラベルは止めます。デモでは行の「読む」で読めます。",
  enter:
    "受け付けた検体が並びます。オーダの項目ごとに値を入れると（Enter で次の項目へ）、基準範囲との H／L とパニック値をコードが判定し、前回値を並べます（基準範囲は JCCLS 共用基準範囲・SRL、パニック値はこの架空の病院の値）。全部の項目を入れて「確定」すると、誰がいつ確定したかが残り、医師のカルテの「未確認の結果」と検査結果の表に出ます。パニック値があれば「結果とパニック値」に出ます。測れない検体（溶血・量不足・凝固・ラベル不一致・その他）は「再採血を依頼する」で理由を選ぶと、同じオーダの採血が新しいラベルで病棟のワークシートに「再採血」として戻ります。確定した結果は下の「確定した結果」から訂正でき、理由が要ります。前の版（誰・いつ・なぜ）は残り、医師には「訂正」の印でもう一度未確認として出ます。訂正でパニック値になれば連絡に進み、パニック値でなくなれば連絡の一覧から外れます。",
  culture:
    "血液培養・尿培養の検体を受け付けると「培養中」で並びます（記録にある培養中・中間報告の培養も）。塗抹（グラム染色）→ 中間報告（菌名）→ 最終報告（菌名と薬剤感受性 S／I／R）の順に、所見を選んで確定すると、誰がいつ報告したかが残り、医師のカルテの「未確認の結果」と細菌検査に出ます。陰性はそのまま最終報告にできます。血液培養の塗抹（陽性のボトル）はパニック値で、医師に連絡して記録するまで次の報告に進めません。S／I／R は検査室の判定を入れ、この画面は判定しません。",
  results:
    "コードが判定したパニック値は、報告するまで日付に関係なく残ります。オーダーした医師に電話か対面で直接伝え、最後に値を復唱してもらいます（提言第20号）。つながらなければ「記録してかけ直す」で回ごとに残します（時刻・手段・相手・誰）。「報告した」は、復唱を確かめたか、復唱できなかった理由を書くと押せます。下の表は今日からの結果です。",
};

/** A day in words (今日・明日・昨日・◯日前). */
const dayLabel = (d: number) => (d === 0 ? "今日" : d === 1 ? "明日" : d === -1 ? "昨日" : d < 0 ? `${-d}日前` : `${d}日後`);

/** 検査室: taking in samples, entering results, and phoning panic values. Code finds and checks; people do. */
export function LabView(p: Props) {
  const { people, items, calls, records, sessionStart, desk, nowTime } = p;
  const nowAbs = abs(0, nowTime);
  const waiting = uncalled(items, calls);
  const [tab, setTab] = useState<Tab>(() => (waiting.length ? "results" : "receive"));
  // The guide follows 「使い方」 on the top row until it is opened or closed here.
  const [hintsOn] = useHints();
  const [guideSet, setGuide] = useState<boolean | null>(null);
  const guide = guideSet ?? hintsOn;
  const [flash, setFlash] = useState("");
  const rows = drawRows(people, records, desk, sessionStart, nowAbs);
  // A sample with only cultures is reported in 培養, not counted here.
  const toEnterCount = rows.filter((r) => r.status === "受付済み" && entryPlan(r.codes).analytes.length > 0).length;
  const cultures = cultureQueue(people, desk, calls).filter((i) => i.next.length > 0 || i.waits).length;
  const badge: Partial<Record<Tab, number>> = { enter: toEnterCount, culture: cultures, results: waiting.length };
  const onPanic = (line: string) => {
    setFlash(`パニック値：${line}。オーダーした医師に連絡し、ここに記録してください。`);
    setTab("results");
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-sheet px-5 py-2">
        <h1 className="flex items-center gap-1.5 text-base font-bold">
          <FlaskConical size={17} />
          検査室（5階東病棟・救急外来・外来）
        </h1>
        <div role="tablist" className="flex rounded-md border border-rule p-0.5 text-sm">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1 rounded px-2.5 py-0.5 ${tab === key ? "bg-ink font-bold text-white" : "text-ink-soft hover:text-ink"}`}
            >
              <Icon size={14} />
              {label}
              {!!badge[key] && <span className={`nums rounded-full px-1.5 text-[11px] font-bold ${key === "results" ? "bg-shu text-white" : "bg-ai-soft text-ai"}`}>{badge[key]}</span>}
            </button>
          ))}
        </div>
        <span className={`text-xs font-bold ${waiting.length ? "text-shu" : "text-wakatake"}`}>
          {waiting.length ? `パニック値の連絡がまだ ${waiting.length}件` : "パニック値はすべて報告済み"}
        </span>
        <button type="button" onClick={() => setGuide(!guide)} aria-expanded={guide} className="ml-auto flex items-center gap-1 rounded border border-rule px-2 py-0.5 text-xs text-ink-soft hover:text-ai">
          <HelpCircle size={13} />
          使い方
        </button>
      </div>
      {guide && (
        <div className="border-b border-rule bg-ai-soft/40 px-5 py-2 text-[12px]">
          <p className="mb-1 flex items-center gap-1 font-bold text-ai">
            <BookOpenText size={14} />
            使い方：{TABS.find((t) => t.key === tab)?.label}
          </p>
          <p className="text-ink">{GUIDE[tab]}</p>
          <p className="mt-1 text-[11px] text-ink-soft">臨床検査技師として操作するには、右上の「自分」で「臨床検査技師」を選びます（デモではログインの代わり）。採取の記録は看護師でワークシートの「照合」から、結果の確認と対応は医師でカルテの右上から行います。</p>
        </div>
      )}
      {flash && (
        <p role="status" className="border-b border-shu/40 bg-shu-soft px-5 py-1.5 text-[12px] font-bold text-shu">
          {flash}
        </p>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-paper p-4 text-[13px]">
        {tab === "receive" && <Receive rows={rows} people={people} nowAbs={nowAbs} onDesk={p.onDesk} />}
        {tab === "enter" && (
          <LabEntry
            rows={rows}
            people={people}
            limits={p.limits}
            nowAbs={nowAbs}
            calls={calls}
            onDesk={p.onDesk}
            onPanic={onPanic}
          />
        )}
        {tab === "culture" && <LabCulture people={people} desk={desk} calls={calls} nowAbs={nowAbs} dayLabel={dayLabel} onDesk={p.onDesk} onPanic={onPanic} />}
        {tab === "results" && <Results {...p} items={labBoard(items, calls)} onReported={() => setFlash("")} />}
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<DrawStatus, string> = {
  未採取: "text-ink-soft",
  採取しなかった: "font-bold text-shu",
  採取済み: "font-bold text-ai",
  受付済み: "font-bold text-wakatake",
  再採血: "font-bold text-yamabuki",
  報告済み: "text-ink-faint",
};

const TONE: Record<SpecimenScan["tone"], string> = {
  ok: "border-wakatake/50 bg-wakatake-soft text-wakatake",
  warn: "border-yamabuki/50 bg-yamabuki-soft text-yamabuki",
  stop: "border-shu/50 bg-shu-soft text-shu",
};

function Receive({ rows, people, nowAbs, onDesk }: { rows: DrawRow[]; people: WorkPatient[]; nowAbs: number; onDesk: Props["onDesk"] }) {
  const me = useMe();
  const deny = useDeny()("lab.receive");
  const [code, setCode] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<SpecimenScan | null>(null);
  const counts = statusCounts(rows);
  const read = (input: string) => {
    const s = scanSpecimen(input, rows, people, nowAbs);
    setCode("");
    box.current?.focus();
    if (!s) return;
    setScan(s);
    const row = s.row;
    if (!s.ok || !row) return;
    onDesk((d) => receive(d, row, me.name, nowAbs));
    auditLog({ role: me.role, actor: me.name, action: "確定（検体の受付）", patient: row.name, detail: `${whenText(row.at)} ${row.tests}${row.status === "採取済み" ? "" : "（病棟の採取の記録なし）"}` });
  };
  return (
    <div className="mx-auto max-w-[1100px] space-y-3">
      <DenyNote action="lab.receive" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          read(code);
        }}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-sheet p-3"
      >
        <ScanLine size={18} className="text-ai" />
        <label className="flex items-center gap-2 font-bold">
          検体ラベル
          <input
            ref={box}
            autoFocus
            disabled={!!deny}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="バーコードリーダーで読む（Enter）"
            aria-label="検体ラベルの番号"
            className="nums w-72 rounded border border-rule bg-paper px-2 py-1 font-normal"
          />
        </label>
        <button type="submit" disabled={!!deny || !code.trim()} className="rounded bg-ai px-3 py-1 font-bold text-white disabled:opacity-40">
          受付
        </button>
        <span className="nums ml-auto text-xs text-ink-soft">
          未採取 {counts.未採取}・採取済み {counts.採取済み}・受付済み {counts.受付済み}・報告済み {counts.報告済み}
          {counts.採取しなかった ? `・採取しなかった ${counts.採取しなかった}` : ""}
          {counts.再採血 ? `・再採血を依頼 ${counts.再採血}` : ""}
        </span>
        {scan && (
          <p role="status" className={`w-full rounded border px-2 py-1 text-[12px] font-bold ${TONE[scan.tone]}`}>
            {scan.message}
          </p>
        )}
      </form>

      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="py-1 pr-2 font-normal">採血の時刻</th>
            <th className="min-w-[9rem] whitespace-nowrap py-1 pr-2 font-normal">患者</th>
            <th className="py-1 pr-2 font-normal">検査</th>
            <th className="py-1 pr-2 font-normal">容器</th>
            <th className="py-1 pr-2 font-normal">ラベル</th>
            <th className="py-1 pr-2 font-normal">状態</th>
            <th className="w-14 py-1 font-normal" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-3 text-center text-ink-faint">
                今日と明日の朝の採血はありません。
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.code} className="border-b border-rule-soft align-top">
              <td className="nums py-1 pr-2">
                {whenText(r.at)}
                {r.urgent && <span className="ml-1 rounded bg-shu px-1 text-[10px] font-bold text-white">至急</span>}
              </td>
              <td className="min-w-[9rem] whitespace-nowrap py-1 pr-2">
                <PlaceMark place={r.place} room={r.room} /> {r.name}
              </td>
              <td className="py-1 pr-2">
                {r.redrawOf && <span className="mr-1 rounded bg-yamabuki px-1 text-[10px] font-bold text-white">再採血</span>}
                {r.tests}
                {r.redrawOf && <span className="block text-[10px] text-yamabuki">前の検体 {r.redrawOf.code}：{rejectText(r.redrawOf)}（{r.redrawOf.time} {r.redrawOf.by}）</span>}
              </td>
              <td className="py-1 pr-2 text-ink-soft">{r.container}</td>
              <td className="nums py-1 pr-2 font-mono text-[11px] text-ink-soft">{r.code}</td>
              <td className={`py-1 pr-2 ${STATUS_STYLE[r.status]}`}>
                {r.status}
                <span className="block text-[10px] font-normal text-ink-soft">{statusNote(r, nowAbs)}</span>
              </td>
              <td className="whitespace-nowrap py-1 text-right">
                {!deny && (r.status === "採取済み" || r.status === "未採取") && (
                  <button type="button" onClick={() => read(r.code)} className="whitespace-nowrap rounded border border-ai px-1.5 text-[11px] text-ai hover:bg-ai hover:text-white" title="デモ：この検体のラベルを読む">
                    読む
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusNote(r: DrawRow, nowAbs: number): string {
  if (r.status === "報告済み") return r.report ? `${r.report.reported.time} ${r.report.by}${versionOf(r.report) > 1 ? `（訂正 第${versionOf(r.report)}版）` : ""}` : "前の記録";
  if (r.status === "再採血" && r.rejection) return `${rejectText(r.rejection)} ${r.rejection.time} ${r.rejection.by} → 新しいラベル ${redrawCode(r.rejection)}`;
  if (r.status === "受付済み") return `${r.reception!.time} ${r.reception!.by}${r.reception!.collected ? "" : "（採取の記録なし）"}`;
  if (r.status === "採取済み") return r.collectedAt === "前の勤務" ? (r.place === "病棟" ? "前の勤務" : `${PLACE_NAME[r.place]}で採取`) : `${r.collectedAt ?? ""} ${r.collectedBy ?? ""}`.trim();
  if (r.status === "採取しなかった") return r.notDoneReason ?? "";
  return r.at <= nowAbs ? "時刻を過ぎた" : "予定";
}

function Results({ people, items, calls, acks, limits, limitsSource, nowTime, attending, onCall, desk, onDesk, onReported }: Props & { onReported: () => void }) {
  const name = (pid: string) => people.find((x) => x.patient.id === pid);
  const sorted = [...items].sort((a, b) => a.day - b.day || (a.time || "99").localeCompare(b.time || "99"));
  const panic = sorted.filter((i) => i.panic.length > 0);
  const when = (i: ResultItem) => (i.time ? whenText(abs(i.day, i.time)) : i.day === 0 ? "—" : whenText(i.day * 1440).replace(/ 00:00$/, ""));
  return (
    <div className="mx-auto max-w-[1100px]">
      <DenyNote action="panic.call" className="mb-2" />
      {panic.length > 0 && (
        <section className="mb-4 space-y-2">
          <h3 className="text-xs font-bold text-shu">パニック値（コードで判定。連絡するのは人）</h3>
          {panic.map((i) => {
            const w = name(i.patientId);
            return (
              <PanicCard
                key={i.key}
                item={i}
                who={w ? `${placeOf(i.patientId) === "病棟" ? w.room : PLACE_NAME[placeOf(i.patientId)]} ${w.patient.name}さん` : i.patientId}
                name={w?.patient.name ?? i.patientId}
                when={when(i)}
                script={w ? callScript(i, w.patient, w.room) : []}
                call={calls[i.key]}
                ack={acks[i.key]}
                tries={desk.tries[i.key] ?? []}
                nowTime={nowTime}
                // A visit's sample: the doctor of that visit ordered it.
                attending={w && placeOf(i.patientId) !== "病棟" ? w.patient.attending : attending}
                onCall={(c) => {
                  onCall(c);
                  onReported();
                }}
                onDesk={onDesk}
              />
            );
          })}
        </section>
      )}

      <section>
        <h3 className="mb-1 text-xs font-bold text-ink-soft">今日からの結果（{items.length}件）</h3>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-rule text-left text-ink-soft">
              <th className="py-1 pr-2 font-normal">時刻</th>
              <th className="py-1 pr-2 font-normal">患者</th>
              <th className="py-1 pr-2 font-normal">種類</th>
              <th className="py-1 font-normal">内容</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((i) => {
              const w = name(i.patientId);
              return (
                <tr key={i.key} className="border-b border-rule-soft align-top">
                  <td className="nums py-1 pr-2">{when(i)}</td>
                  <td className="py-1 pr-2">
                    <PlaceMark place={placeOf(i.patientId)} room={w?.room ?? ""} /> {w?.patient.name}
                  </td>
                  <td className="py-1 pr-2">{i.title}</td>
                  <td className={`py-1 ${i.panic.length ? "font-bold text-shu" : ""}`}>
                    {i.panic.length ? `パニック値：${i.panic.map(hitLine).join("、")}` : i.detail}
                    {i.corrected && <span className="block font-bold text-yamabuki">{i.corrected}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-md border border-rule bg-sheet p-3 text-[11px] text-ink-soft">
        <h3 className="mb-1 font-bold">この架空の病院のパニック値</h3>
        <p className="nums">
          {limits
            .map((l) => {
              const a = ANALYTES.find((x) => x.code === l.code);
              return `${a?.name ?? l.code} ${[l.low !== undefined ? `${l.low}以下` : "", l.high !== undefined ? `${l.high}以上` : ""].filter(Boolean).join("・")}${a?.unit ? ` ${a.unit}` : ""}`;
            })
            .join("　")}
        </p>
        <p className="mt-1">{limitsSource}</p>
      </section>
    </div>
  );
}
