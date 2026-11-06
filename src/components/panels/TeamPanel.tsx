"use client";

import { displayText } from "@/lib/display-text";
import { useState } from "react";
import { auditLog } from "@/lib/audit";
import type { CalendarDate } from "@/lib/dates";
import { TEAMS, TEAM_HOUSE_RULES, openRequest, requestProblems, requestStatus, teamOf, type TeamDesk, type TeamKey } from "@/lib/teams";
import { DenyNote, useDeny, useMe } from "../RoleContext";
import { AddonBox, RoundCard, STATUS_TONE } from "../TeamsView";

interface Props {
  patientId: string;
  patientName: string;
  desk: TeamDesk;
  onDesk: (f: (d: TeamDesk) => TeamDesk) => void;
  today: CalendarDate;
  nowTime: string;
}

const field = "rounded border border-rule bg-paper px-1.5 py-0.5 outline-none focus:border-ai";

/** In the chart: ask a team (医師), see its rounds, and adopt or not each of its proposals (医師). */
export function TeamPanel({ patientId, patientName, desk, onDesk, today, nowTime }: Props) {
  const me = useMe();
  const deny = useDeny();
  const requestLock = !!deny("team.request");
  const decideLock = !!deny("team.decide");
  const [team, setTeam] = useState<TeamKey>("nst");
  const [reason, setReason] = useState("");
  const [urgency, setUrgency] = useState<"通常" | "至急">("通常");
  const open = openRequest(desk, team, patientId);
  const problems = requestProblems({ reason }, open);
  const mine = desk.requests.filter((r) => r.patientId === patientId);
  return (
    <div className="space-y-3 text-[12px]">
      <section className="space-y-1">
        <h3 className="font-bold">チームに依頼する</h3>
        <div className="flex flex-wrap gap-1">
          {TEAMS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTeam(t.key)} aria-pressed={team === t.key} className={`rounded border px-2 py-0.5 ${team === t.key ? "border-ai bg-ai-soft font-bold text-ai" : "border-rule text-ink-soft"}`}>
              {t.name}
            </button>
          ))}
        </div>
        <p className="text-ink-soft">
          {teamOf(team).long}：{teamOf(team).what}
        </p>
        <AddonBox team={teamOf(team)} />
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="依頼の理由・相談したいこと" aria-label="依頼の理由" className={`${field} block w-full`} disabled={requestLock} />
        <p className="flex flex-wrap items-center gap-2">
          {(["通常", "至急"] as const).map((u) => (
            <label key={u} className="flex items-center gap-1">
              <input type="radio" name="team-urgency" checked={urgency === u} onChange={() => setUrgency(u)} disabled={requestLock} />
              {u}
            </label>
          ))}
          <button
            type="button"
            disabled={requestLock || problems.length > 0}
            onClick={() => {
              const id = `team-${patientId}-${team}-${desk.requests.length + 1}`;
              auditLog({ role: me.role, actor: me.name, action: `確定（${teamOf(team).name}への依頼）`, patient: patientName, detail: `${urgency}　${reason.trim().slice(0, 60)}` });
              onDesk((d) => ({ ...d, requests: [...d.requests, { id, team, patientId, reason: reason.trim(), urgency, by: me.name, at: { day: 0, time: nowTime } }] }));
              setReason("");
            }}
            className="rounded bg-ai px-2.5 py-0.5 font-bold text-white disabled:opacity-40"
          >
            依頼する
          </button>
          {open && <span className="font-bold text-yamabuki">このチームへの依頼がもうあります（{requestStatus(open)}）。終了してから出し直します。</span>}
        </p>
        <DenyNote action="team.request" />
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">この患者の依頼と回診（{mine.length}）</h3>
        {mine.length === 0 && <p className="text-ink-faint">まだありません。</p>}
        {mine.map((r) => (
          <div key={r.id} className="space-y-1 rounded-md border border-rule p-2">
            <p>
              <b>{teamOf(r.team).name}</b> <span className={STATUS_TONE[requestStatus(r)]}>{requestStatus(r)}</span>　{r.urgency}　依頼 {r.at.time} {displayText(r.by)}：{displayText(r.reason)}
            </p>
            {r.closed && <p className="text-ink-soft">終了：{r.closed.summary}</p>}
            {desk.rounds
              .filter((x) => x.requestId === r.id)
              .map((x) => (
                <RoundCard
                  key={x.id}
                  round={x}
                  today={today}
                  locked={decideLock}
                  onDecide={(recId, adopt, why) => {
                    const rec = x.recs.find((y) => y.id === recId);
                    auditLog({ role: me.role, actor: me.name, action: `確定（${teamOf(r.team).name}の提案を${adopt ? "採用" : "不採用"}）`, patient: patientName, detail: `${rec?.text ?? ""}${why ? `　理由：${why}` : ""}` });
                    onDesk((d) => ({
                      ...d,
                      rounds: d.rounds.map((y) => (y.id === x.id ? { ...y, recs: y.recs.map((z) => (z.id === recId ? { ...z, decision: { adopt, ...(why ? { reason: why } : {}), by: me.name, at: { day: 0, time: nowTime } } } : z)) } : y)),
                    }));
                  }}
                />
              ))}
          </div>
        ))}
        <DenyNote action="team.decide" />
      </section>
      <p className="hint text-[11px] text-ink-faint">
        {TEAM_HOUSE_RULES.request}不採用は理由を書いて記録します。チームの回診の記録は場所の「チーム医療」で書きます。
      </p>
    </div>
  );
}
