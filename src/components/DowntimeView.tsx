"use client";

import { BookOpen, Download, ExternalLink, FileText, LifeBuoy, Printer, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { auditLog } from "@/lib/audit";
import type { CalendarDate } from "@/lib/dates";
import { DOWNTIME_CSS, DOWNTIME_PAGE, DOWNTIME_SOURCES, downtimeBody, downtimeDocument, downtimeSnapshot, forgetDowntime, keepDowntime, madeAtNow, type DowntimeSnapshot } from "@/lib/downtime";
import { abs } from "@/lib/flowsheet";
import type { AdminRecord } from "@/lib/mar";
import { MANUALS } from "@/lib/manuals";
import type { WorkPatient } from "@/lib/worksheet";
import { saveFile, Sources, SubTabs, usePrintSheet } from "./DeskParts";
import { ManualView } from "./ManualView";
import { useMe } from "./RoleContext";

type Tab = "sheet" | "manual";
type Sw = "registered" | "unsupported" | "failed" | null;

interface Props {
  /** The wards to choose from. */
  places: string[];
  /** The patients on a ward's beds, with the record as it stands. */
  rowsFor: (place: string) => WorkPatient[];
  today: CalendarDate;
  nowTime: string;
  mar: Record<string, AdminRecord>;
  sessionStart: number;
  /** 閲覧制限 and not on my care team. */
  limited: (patientId: string) => boolean;
}

const DOWNTIME_MANUAL = MANUALS.filter((m) => m.id === "m-downtime");

/**
 * 障害時の参照: each patient's essentials of a ward, made by code from the record as it stands. Opening this
 * screen keeps the sheet in this browser, where /downtime/index.html shows it even without a network; it
 * also prints and saves as an HTML file. 障害時の手順 is the fictional hospital's manual for it.
 */
export function DowntimeView({ places, rowsFor, today, nowTime, mar, sessionStart, limited }: Props) {
  const me = useMe();
  const [tab, setTab] = useState<Tab>("sheet");
  const [place, setPlace] = useState(places[0] ?? "");
  const make = (where: string): DowntimeSnapshot => downtimeSnapshot(rowsFor(where), { today, nowAbs: abs(0, nowTime), mar, sessionStart, limited, by: me.name, place: where, madeAt: madeAtNow() });
  // Opening the screen keeps the sheet in this browser (for the page that opens offline).
  const [state, setState] = useState(() => {
    const shot = make(place);
    return { shot, kept: keepDowntime(shot) };
  });
  const [sw, setSw] = useState<Sw>(null);
  const [print, sheet] = usePrintSheet();

  useEffect(() => {
    // The page that opens without a network: its own service worker (scope /downtime/ only).
    if (!("serviceWorker" in navigator)) {
      queueMicrotask(() => setSw("unsupported"));
      return;
    }
    navigator.serviceWorker.register("/downtime/sw.js", { scope: "/downtime/" }).then(
      () => setSw("registered"),
      () => setSw("failed"),
    );
  }, []);

  const remake = (where: string) => {
    const shot = make(where);
    const kept = keepDowntime(shot);
    setState({ shot, kept });
    auditLog({ role: me.role, actor: me.name, action: "障害時の参照をこの端末に保存した", detail: `${where} ${shot.patients.length}人` });
  };
  const { shot, kept } = state;
  const body = downtimeBody(shot);
  const fileName = `障害時の参照_${shot.place}_${shot.madeAt.replace(/[/: ]/g, "")}.html`;

  return (
    <section aria-label="障害時の参照" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <style>{DOWNTIME_CSS}</style>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <LifeBuoy size={18} className="text-ai" />
          障害時の参照

        </h1>
        <SubTabs
          label="障害時の画面"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "sheet", label: "参照の印刷・保存", icon: FileText },
            { key: "manual", label: "障害時の手順", icon: BookOpen },
          ]}
        />
      </header>
      {tab === "manual" ? (
        <div className="flex min-h-[70vh] flex-col">
          <ManualView manuals={DOWNTIME_MANUAL} />
        </div>
      ) : (
        <div className="space-y-3 px-5 py-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              病棟
              <select
                value={place}
                onChange={(e) => {
                  setPlace(e.target.value);
                  remake(e.target.value);
                }}
                className="rounded border border-rule bg-sheet px-2 py-1"
              >
                {places.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => remake(place)} className="flex items-center gap-1 rounded-md border border-rule bg-sheet px-2.5 py-1 hover:border-ai hover:text-ai">
              <RefreshCw size={14} />
              いまの記録で作り直す
            </button>
            <button
              type="button"
              onClick={() => {
                auditLog({ role: me.role, actor: me.name, action: "障害時の参照を印刷した", detail: `${shot.place} ${shot.patients.length}人` });
                print(<div className="dt-sheet" dangerouslySetInnerHTML={{ __html: body }} />, { portrait: true });
              }}
              className="flex items-center gap-1 rounded-md bg-ai px-3 py-1 font-bold text-white"
            >
              <Printer size={14} />
              印刷（PDF にも）
            </button>
            <button
              type="button"
              onClick={() => {
                auditLog({ role: me.role, actor: me.name, action: "障害時の参照を HTML で保存した", detail: `${shot.place} ${shot.patients.length}人` });
                saveFile(fileName, downtimeDocument(shot), "text/html;charset=utf-8");
              }}
              className="flex items-center gap-1 rounded-md border border-rule bg-sheet px-2.5 py-1 hover:border-ai hover:text-ai"
            >
              <Download size={14} />
              HTML で保存
            </button>
            <a href={DOWNTIME_PAGE} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border border-rule bg-sheet px-2.5 py-1 text-ai hover:border-ai">
              <ExternalLink size={14} />
              オフライン用の画面を開く
            </a>
            <button
              type="button"
              onClick={() => {
                forgetDowntime();
                setState((s) => ({ ...s, kept: false }));
                auditLog({ role: me.role, actor: me.name, action: "障害時の参照をこの端末から消した" });
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-ink-soft hover:text-shu"
            >
              <Trash2 size={14} />
              この端末の保存を消す
            </button>
          </div>
          <p role="status" className={`rounded-md border px-3 py-1.5 ${kept ? "border-wakatake bg-wakatake-soft" : "border-yamabuki bg-yamabuki-soft"}`}>
            {kept
              ? `${shot.madeAt} 現在の参照（${shot.place}・${shot.patients.length}人）をこの端末のブラウザに保存しました。`
              : "この端末のブラウザには保存されていません（プライベートブラウズのときや、消したとき）。印刷か HTML で保存してください。"}
            {sw === "registered" && " オフライン用の画面（/downtime/index.html）は、ネットワークがなくてもこの端末で開けます。"}
            {sw === "unsupported" && " このブラウザはオフライン用の画面に対応していません。印刷か HTML で保存してください。"}
            {sw === "failed" && " オフライン用の画面を準備できませんでした。印刷か HTML で保存してください。"}
          </p>
          <p className="hint text-[12px] text-ink-soft">
            この画面を開くと、選んだ病棟の参照を作り、この端末に保存します。病棟を変えるか「いまの記録で作り直す」で作り直します。「印刷」は A4 縦で、PDF にするときは印刷の画面で「PDF に保存」を選びます。「HTML で保存」したファイルは、アプリやネットワークがなくても開けます。
          </p>
          <p className="hint text-[12px] text-ink-soft">
            載せるのは、患者ごとの氏名・アレルギー・感染症・救命処置・有効な指示・今日の与薬予定（実施を手で書く欄つき）・直近のバイタル・直近の検査です。閲覧制限のある患者は、担当のチームでなければ安全に関わることだけを載せます。保存した参照はこの端末に残るので、端末の管理（持ち出し・共用）に気をつけてください。
          </p>
          <div className="rounded-lg border border-rule bg-white p-4">
            <div className="dt-sheet" dangerouslySetInnerHTML={{ __html: body }} />
          </div>
          <Sources items={DOWNTIME_SOURCES} />
        </div>
      )}
      {sheet}
    </section>
  );
}
