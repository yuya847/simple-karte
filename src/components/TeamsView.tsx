"use client";

import { NutritionRoundSchedule } from "./NutritionRoundSchedule";
import { displayText } from "@/lib/display-text";
import { LayoutList, UsersRound } from "lucide-react";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { addDays, formatShort, type CalendarDate } from "@/lib/dates";
import { dietAt, nextMeal, type DietOrder } from "@/lib/diet";
import { diagnosisLabel, type Diagnosis } from "@/lib/diagnoses";
import { abs } from "@/lib/flowsheet";
import {
  TEAMS,
  TEAM_HOUSE_RULES,
  TEAM_SOURCES,
  factsFor,
  limitNote,
  requestStatus,
  roundProblems,
  teamOf,
  undecided,
  worklist,
  type RequestStatus,
  type Team,
  type TeamDesk,
  type TeamKey,
  type TeamRequest,
  type TeamRound,
} from "@/lib/teams";
import type { Patient } from "@/lib/types";
import { Sources, SubTabs } from "./DeskParts";
import { DenyNote, useDeny, useMe } from "./RoleContext";

type Person = { patient: Patient; room: string };

interface Props {
  /** Every inpatient (all wards). */
  people: Person[];
  desk: TeamDesk;
  onDesk: (f: (d: TeamDesk) => TeamDesk) => void;
  diagnoses: Record<string, Diagnosis[]>;
  diets: DietOrder[];
  today: CalendarDate;
  nowTime: string;
  /** Open the patient's chart at the チーム医療 tool. */
  onOpen: (patientId: string) => void;
  /** The tab shown first (for tests). */
  start?: TeamKey | "all";
}

const card = "rounded-lg border border-rule bg-sheet";
const field = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";
const btn = "rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40";
export const STATUS_TONE: Record<RequestStatus, string> = { 依頼中: "font-bold text-shu", 介入中: "font-bold text-ai", 終了: "text-ink-soft" };
const dayWord = (today: CalendarDate, d: number) => (d === 0 ? "今日" : d === -1 ? "昨日" : formatShort(addDays(today, d)));

/** The weekday (0 = Sunday) of a day offset from `today`. */
export const dowFrom = (today: CalendarDate) => (d: number) => {
  const c = addDays(today, d);
  return new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay();
};

/**
 * チーム医療: each team's requests from the charts, its rounds and proposals, and the conditions of its fee
 * (as the 告示 and 通知 write them) with what the record shows. The attending decides on the proposals in
 * the chart. No AI.
 */
export function TeamsView(p: Props) {
  const [tab, setTab] = useState<TeamKey | "all">(p.start ?? "all");
  return (
    <section aria-label="チーム医療" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <UsersRound size={18} className="text-ai" />
          チーム医療

        </h1>
        <SubTabs
          label="チーム"
          value={tab}
          onChange={setTab}
          tabs={[{ key: "all" as const, label: "全体", icon: LayoutList }, ...TEAMS.map((t) => ({ key: t.key, label: t.name, badge: p.desk.requests.filter((r) => r.team === t.key && requestStatus(r) === "依頼中").length }))]}
        />
      </header>
      <div className="space-y-4 px-5 py-4 text-[13px]">
        {tab === "all" ? <Overview {...p} onTeam={setTab} /> : <TeamPage key={tab} {...p} team={teamOf(tab)} />}
        <p className="text-[11px] text-ink-faint">
          {TEAM_HOUSE_RULES.filed}
          {TEAM_HOUSE_RULES.request}
          {TEAM_HOUSE_RULES.billing}
        </p>
        <Sources items={[...TEAM_SOURCES]} />
      </div>
    </section>
  );
}

function Overview({ desk, people, onTeam, onOpen, today }: Props & { onTeam: (k: TeamKey) => void }) {
  const waiting = undecided(desk);
  const nameOf = (pid: string) => people.find((x) => x.patient.id === pid);
  return (
    <section className="space-y-3">

      <table className={`${card} w-full border-collapse text-[12px]`}>
        <thead>
          <tr className="border-b border-rule text-left text-ink-soft">
            <th className="px-2 py-1 font-normal">チーム</th>
            <th className="px-2 py-1 font-normal">依頼中</th>
            <th className="px-2 py-1 font-normal">介入中</th>
            <th className="px-2 py-1 font-normal">加算</th>
          </tr>
        </thead>
        <tbody>
          {TEAMS.map((t) => {
            const rs = desk.requests.filter((r) => r.team === t.key);
            const n = (s: RequestStatus) => rs.filter((r) => requestStatus(r) === s).length;
            return (
              <tr key={t.key} className="border-b border-rule-soft">
                <td className="px-2 py-1">
                  <button type="button" onClick={() => onTeam(t.key)} className="text-ai underline">
                    {t.long}
                  </button>
                </td>
                <td className={`nums px-2 py-1 ${n("依頼中") ? "font-bold text-shu" : "text-ink-faint"}`}>{n("依頼中")}</td>
                <td className="nums px-2 py-1">{n("介入中")}</td>
                <td className="px-2 py-1 text-ink-soft">{displayText(t.addon ? `${t.addon.code} ${t.addon.name}（${t.addon.limit}）` : "患者ごとの加算なし")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2 className="text-xs font-bold text-ink-soft">主治医の採否を待っている提案（{waiting.length}）</h2>
      {waiting.length === 0 && <p className="text-ink-faint">ありません。</p>}
      <ul className="space-y-1">
        {waiting.map(({ round, rec }) => {
          const x = nameOf(round.patientId);
          return (
            <li key={rec.id} className={`${card} px-3 py-1.5 text-[12px]`}>
              <b>{displayText(teamOf(round.team).name)}</b>　{displayText(x ? `${x.room}　${x.patient.name}` : round.patientId)}（主治医 {x?.patient.attending ?? "—"}）：{displayText(rec.text)}
              <span className="ml-2 text-ink-soft">
                {dayWord(today, round.at.day)} {round.at.time} の回診
              </span>
              <button type="button" onClick={() => onOpen(round.patientId)} className="ml-2 rounded border border-ai px-1.5 text-[11px] text-ai">
                カルテを開く
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The fee of the team as the 告示 and 通知 write it. */
export function AddonBox({ team }: { team: Team }) {
  if (team.key === "nst") return <p className="text-xs text-ink-soft">{team.addon?.name}</p>;
  return (
    <div className="space-y-1 rounded-md border border-rule bg-paper p-2 text-[12px]">
      {team.addon ? (
        <>
          <p>
            <b>
              {team.addon.code} {displayText(team.addon.name)}
            </b>
            　{team.addon.points}（{team.addon.limit}）
          </p>
          <p className="text-ink-soft">対象：</p>
          <ul className="list-disc pl-5">
            {team.addon.who.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <ul className="list-disc pl-5 text-ink-soft">
            {team.addon.notes.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-ink-soft">{team.noAddon}</p>
      )}
      {team.staffing && <p className="text-ink-soft">チームの構成（施設基準）：{team.staffing}</p>}
    </div>
  );
}

/** A round with its proposals and the attending's decisions (and the buttons, in the chart). */
export function RoundCard({ round, today, onDecide, locked }: { round: TeamRound; today: CalendarDate; onDecide?: (recId: string, adopt: boolean, reason: string) => void; locked?: boolean }) {
  const [why, setWhy] = useState<Record<string, string>>({});
  return (
    <div className="rounded-md border border-rule-soft bg-paper p-2 text-[12px]">
      <p>
        <b>
          {dayWord(today, round.at.day)} {round.at.time}
        </b>{" "}
        {displayText(teamOf(round.team).name)}の回診（記録 {displayText(round.by)}）
        <span className="ml-1 text-ink-soft">参加：{round.members.join("、")}</span>
      </p>
      <p className="whitespace-pre-wrap">{round.assessment}</p>
      {round.recs.length > 0 && <p className="mt-1 text-ink-soft">提案：</p>}
      <ul className="space-y-0.5">
        {round.recs.map((rec) => (
          <li key={rec.id} className="flex flex-wrap items-center gap-1">
            <span>・{displayText(rec.text)}</span>
            {rec.decision ? (
              <span className={rec.decision.adopt ? "text-wakatake" : "text-ink-soft"}>
                → {displayText(rec.decision.adopt ? "採用" : `不採用（${rec.decision.reason ?? ""}）`)}　{dayWord(today, rec.decision.at.day)} {rec.decision.at.time} {displayText(rec.decision.by)}
              </span>
            ) : onDecide ? (
              <>
                <button type="button" disabled={locked} onClick={() => onDecide(rec.id, true, "")} className="rounded border border-wakatake px-1.5 text-wakatake disabled:opacity-40">
                  採用
                </button>
                <input value={why[rec.id] ?? ""} onChange={(e) => setWhy({ ...why, [rec.id]: e.target.value })} placeholder="不採用の理由" aria-label="不採用の理由" className={`${field} w-40 text-[11px]`} disabled={locked} />
                <button type="button" disabled={locked || !(why[rec.id] ?? "").trim()} onClick={() => onDecide(rec.id, false, why[rec.id].trim())} className="rounded border border-shu px-1.5 text-shu disabled:opacity-40">
                  不採用
                </button>
              </>
            ) : (
              <span className="font-bold text-yamabuki">→ 主治医の採否待ち</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamPage({ team, desk, onDesk, people, diagnoses, diets, today, nowTime, onOpen }: Props & { team: Team }) {
  const me = useMe();
  const locked = !!useDeny()("team.round");
  const [withClosed, setWithClosed] = useState(false);
  const list = worklist(desk, team.key, withClosed);
  const dow = dowFrom(today);
  const nowAbs = abs(0, nowTime);
  const next = nextMeal(nowAbs);
  const log = (r: TeamRequest, what: string, detail = "") => auditLog({ role: me.role, actor: me.name, action: `確定（${team.name}：${what}）`, patient: people.find((x) => x.patient.id === r.patientId)?.patient.name, detail });
  return (
    <section className="space-y-3">
      <div className={`${card} space-y-1 p-3`}>
        <p className="text-[14px] font-bold">{team.long}</p>
        <p className="text-[12px] text-ink-soft">{team.what}</p>
        <p className="text-[12px]">メンバー：{displayText(team.members.map((m) => `${m.name}（${m.job}）`).join("、"))}</p>
        <AddonBox team={team} />
      </div>
      <div className="flex items-center gap-2 text-[12px]">
        <h2 className="font-bold">依頼（{list.length}）</h2>
        <label className="flex items-center gap-1 text-ink-soft">
          <input type="checkbox" checked={withClosed} onChange={(e) => setWithClosed(e.target.checked)} />
          終了したものも表示
        </label>
      </div>
      <DenyNote action="team.round" />
      {list.length === 0 && <p className="text-ink-faint">依頼はありません。</p>}
      {list.map((r) => {
        const x = people.find((y) => y.patient.id === r.patientId);
        const facts = factsFor(team.key, { diagnoses: (diagnoses[r.patientId] ?? []).map(diagnosisLabel), dietKind: dietAt(diets, r.patientId, next.day, next.meal)?.kind, cautions: x?.patient.cautions ?? [] });
        const note = limitNote(team, desk, r, 0, dow, x?.patient.admittedOn ?? 0);
        return (
          <div key={r.id}>
          {team.key === "nst" && !r.closed && <NutritionRoundSchedule value={r.nextRound} today={today} locked={locked} onSave={at => {
            log(r,"回診の予定",`${at.day}日 ${at.time}`);
            onDesk(d => ({...d,requests:d.requests.map(x => x.id === r.id ? {...x,nextRound:at} : x)}));
          }} />}
          <RequestCard key={r.id} r={r} team={team} who={x} facts={facts} note={note} desk={desk} today={today} locked={locked} onOpen={onOpen}
            onAccept={() => {
              log(r, "依頼を受けた");
              onDesk((d) => ({ ...d, requests: d.requests.map((y) => (y.id === r.id ? { ...y, accepted: { day: 0, time: nowTime, by: me.name } } : y)) }));
            }}
            onRound={(f) => {
              const id = `round-${r.id}-${desk.rounds.length + 1}`;
              log(r, "回診の記録", `${f.assessment.slice(0, 60)}　提案${f.recs.length}件`);
              onDesk((d) => ({ ...d, requests:d.requests.map(x => x.id === r.id ? {...x,nextRound:undefined} : x), rounds: [...d.rounds, { id, requestId: r.id, team: team.key, patientId: r.patientId, at: { day: 0, time: nowTime }, by: me.name, members: f.members, assessment: f.assessment, recs: f.recs.map((text, i) => ({ id: `${id}-rec${i + 1}`, text })) }] }));
            }}
            onClose={(summary) => {
              log(r, "終了", summary);
              onDesk((d) => ({ ...d, requests: d.requests.map((y) => (y.id === r.id ? { ...y, closed: { day: 0, time: nowTime, by: me.name, summary } } : y)) }));
            }}
          />
          </div>
        );
      })}
    </section>
  );
}

function RequestCard({
  r,
  team,
  who,
  facts,
  note,
  desk,
  today,
  locked,
  onOpen,
  onAccept,
  onRound,
  onClose,
}: {
  r: TeamRequest;
  team: Team;
  who?: Person;
  facts: ReturnType<typeof factsFor>;
  note: string | null;
  desk: TeamDesk;
  today: CalendarDate;
  locked: boolean;
  onOpen: (pid: string) => void;
  onAccept: () => void;
  onRound: (f: { members: string[]; assessment: string; recs: string[] }) => void;
  onClose: (summary: string) => void;
}) {
  const me = useMe();
  const [form, setForm] = useState<{ members: string[]; assessment: string; recs: string } | null>(null);
  const [summary, setSummary] = useState("");
  const status = requestStatus(r);
  const rounds = desk.rounds.filter((x) => x.requestId === r.id);
  const problems = form ? roundProblems(form, r) : [];
  return (
    <article className={`${card} space-y-2 p-3 text-[12px]`}>
      <header className="flex flex-wrap items-baseline gap-x-3">
        <span className={STATUS_TONE[status]}>{status}</span>
        {r.urgency === "至急" && <span className="rounded bg-shu px-1 text-[10px] font-bold text-white">至急</span>}
        <button type="button" onClick={() => onOpen(r.patientId)} className="font-bold text-ai underline">
          {displayText(who ? `${who.room}　${who.patient.name}` : r.patientId)}
        </button>
        <span className="text-ink-soft">
          {who ? `${who.patient.sex}・${who.patient.age}歳　${who.patient.department}　主治医 ${who.patient.attending}` : ""}
        </span>
        <span className="text-ink-soft">
          依頼 {dayWord(today, r.at.day)} {r.at.time} {displayText(r.by)}
          {displayText(r.accepted && `　受付 ${dayWord(today, r.accepted.day)} ${r.accepted.time} ${r.accepted.by}`)}
        </span>
      </header>
      <p>依頼の理由：{displayText(r.reason)}</p>
      {r.closed && (
        <p className="text-ink-soft">
          終了 {dayWord(today, r.closed.day)} {r.closed.time} {displayText(r.closed.by)}：{r.closed.summary}
        </p>
      )}
      {(facts.length > 0 || note) && (
        <div className="rounded-md bg-ai-soft/40 p-2">
          <p className="text-[11px] font-bold text-ink-soft">加算の条件について（決めるのはチームと主治医）</p>
          <ul className="space-y-0.5">
            {facts.map((f) => (
              <li key={f.text} className={f.kind === "seen" ? "" : "text-ink-soft"}>
                {f.kind === "seen" ? "記録から：" : "確かめる："}
                {displayText(f.text)}
              </li>
            ))}
            {note && <li className="text-ink-soft">{displayText(note)}</li>}
          </ul>
        </div>
      )}
      {rounds.map((x) => (
        <RoundCard key={x.id} round={x} today={today} />
      ))}
      {!r.closed && (
        <div className="flex flex-wrap items-center gap-2">
          {status === "依頼中" && (
            <button type="button" disabled={locked} onClick={onAccept} className={btn}>
              依頼を受ける
            </button>
          )}
          {status === "介入中" && !form && (
            <button type="button" disabled={locked} onClick={() => setForm({ members: [me.name], assessment: "", recs: "" })} className={btn}>
              回診を記録する
            </button>
          )}
          {status === "介入中" && (
            <>
              <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="終了のまとめ（例：経口摂取が安定）" aria-label="終了のまとめ" className={`${field} w-64`} disabled={locked} />
              <button type="button" disabled={locked || !summary.trim()} onClick={() => onClose(summary.trim())} className="rounded border border-rule px-2 text-ink-soft disabled:opacity-40">
                終了する
              </button>
            </>
          )}
        </div>
      )}
      {form && (
        <div className="space-y-1 rounded-md border border-ai p-2">
          <p className="flex flex-wrap gap-x-3">
            参加した人：
            {[...team.members, ...(!team.members.some(m => m.name === me.name) ? [{name:me.name,job:me.role}] : [])].map((m) => (
              <label key={m.name} className="flex items-center gap-1">
                <input type="checkbox" checked={form.members.includes(m.name)} onChange={(e) => setForm({ ...form, members: e.target.checked ? [...form.members, m.name] : form.members.filter((y) => y !== m.name) })} />
                {displayText(m.name)}
              </label>
            ))}
          </p>
          <textarea value={form.assessment} onChange={(e) => setForm({ ...form, assessment: e.target.value })} rows={3} placeholder="評価・所見" aria-label="評価・所見" className={`${field} block w-full`} />
          <textarea value={form.recs} onChange={(e) => setForm({ ...form, recs: e.target.value })} rows={3} placeholder="主治医への提案（1行に1つ）" aria-label="主治医への提案" className={`${field} block w-full`} />
          {problems.length > 0 && <p className="text-ink-soft">足りないもの：{problems.join("、")}</p>}
          <p className="flex gap-2">
            <button
              type="button"
              disabled={locked || problems.length > 0}
              onClick={() => {
                onRound({ members: form.members, assessment: form.assessment.trim(), recs: form.recs.split(/\n/).map((s) => s.trim()).filter(Boolean) });
                setForm(null);
              }}
              className={btn}
            >
              回診を確定
            </button>
            <button type="button" onClick={() => setForm(null)} className="rounded border border-rule px-2 text-ink-soft">
              やめる
            </button>
          </p>
        </div>
      )}
    </article>
  );
}

/* Help migration source (references and dynamic wording):
<p >依頼は医師がカルテの右端「オーダ › その他 › チーム依頼」から出します。チームは依頼を受けて回診を記録し、提案を書きます。提案を採用するかは主治医がカルテで決めます。</p>
*/
