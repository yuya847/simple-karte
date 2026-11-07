import { describe, expect, it } from "vitest";
import { EMPTY_TEAMS, TEAMS, factsFor, initialTeams, limitNote, openRequest, requestProblems, requestStatus, roundProblems, roundsInWeek, teamOf, undecided, weekStartOf, worklist, type TeamDesk } from "./teams";

// Today is a Wednesday: day 0 → weekday 3.
const dow = (d: number) => (((3 + d) % 7) + 7) % 7;

describe("チームと加算", () => {
  it("has the seven teams; each fee has its 告示 code, points and limit, ICT has none per patient", () => {
    expect(TEAMS.map((t) => t.key)).toEqual(["nst", "ict", "pc", "pu", "rst", "dementia", "liaison", "oral"]);
    expect(teamOf("nst").addon).toMatchObject({ code: "A233-2", points: "200点", limit: "週1回" });
    expect(teamOf("pc").addon).toMatchObject({ code: "A226-2", points: "390点", limit: "1日につき" });
    expect(teamOf("pu").addon).toMatchObject({ code: "A236", points: "500点", limit: "入院中1回" });
    expect(teamOf("rst").addon).toMatchObject({ code: "A242", points: "150点", limit: "週1回" });
    expect(teamOf("dementia").addon?.points).toContain("186点");
    expect(teamOf("liaison").addon?.points).toContain("700点");
    expect(teamOf("ict").addon).toBeUndefined();
    expect(teamOf("ict").noAddon).toContain("A234-2");
  });
  it("the week runs Sunday to Saturday", () => {
    expect(weekStartOf(0, dow)).toBe(-3);
    expect(weekStartOf(4, dow)).toBe(4);
  });
});

describe("依頼・回診・提案", () => {
  const desk: TeamDesk = initialTeams();
  it("starts with an NST request taken and seen once, and an ICT request not taken yet", () => {
    expect(desk.requests.map(requestStatus)).toEqual(["介入中", "依頼中"]);
    expect(worklist(desk, "nst").map((r) => r.id)).toEqual(["team-demo-1"]);
    expect(undecided(desk, "90010244").map((x) => x.rec.id)).toEqual(["rec-demo-2"]);
    expect(undecided(desk, "90010231")).toEqual([]);
  });
  it("does not make a second open request to the same team, and needs the reason", () => {
    const open = openRequest(desk, "nst", "90010244");
    expect(requestProblems({ reason: "相談" }, open)).toHaveLength(1);
    expect(requestProblems({ reason: " " }, undefined)).toEqual(["依頼の理由・相談したいこと"]);
    expect(openRequest(desk, "pc", "90010244")).toBeUndefined();
  });
  it("records a round only on a request the team has taken", () => {
    const ict = desk.requests[1];
    expect(roundProblems({ members: [], assessment: "" }, ict)).toEqual(["先に依頼を受けてください。", "参加した人", "評価・所見"]);
    expect(roundProblems({ members: ["a"], assessment: "b" }, desk.requests[0])).toEqual([]);
  });
  it("counts the rounds of the week against 週1回, and the 入院日数 for 認知症ケア加算", () => {
    expect(roundsInWeek(desk, "team-demo-1", 0, dow)).toHaveLength(1);
    expect(limitNote(teamOf("nst"), desk, desk.requests[0], 0, dow, -1)).toBe("今週（日〜土）の回診 1回：栄養サポートチーム加算は週1回まで");
    const r = { ...desk.requests[0], team: "dementia" as const };
    expect(limitNote(teamOf("dementia"), EMPTY_TEAMS, r, 0, dow, -13)).toContain("入院14日目：イ 14日以内の期間");
    expect(limitNote(teamOf("dementia"), EMPTY_TEAMS, r, 0, dow, -14)).toContain("ロ 15日以上の期間");
    expect(limitNote(teamOf("ict"), desk, desk.requests[1], 0, dow, -3)).toBeNull();
  });
});

describe("記録から見えること", () => {
  it("shows what the record holds and leaves the judgement to people", () => {
    expect(factsFor("nst", { diagnoses: [], dietKind: "経管栄養", cautions: [] })[0]).toMatchObject({ kind: "seen" });
    const pc = factsFor("pc", { diagnoses: ["胃癌", "高血圧症"], cautions: [] });
    expect(pc[0].text).toContain("胃癌");
    expect(pc.at(-1)!.kind).toBe("check");
    expect(factsFor("pc", { diagnoses: ["肺炎"], cautions: [] })[0].text).toContain("見当たらない");
    expect(factsFor("liaison", { diagnoses: ["せん妄"], cautions: [] })[0].text).toContain("1 認知症又はせん妄");
    expect(factsFor("rst", { diagnoses: [], cautions: [] })).toHaveLength(1);
    expect(factsFor("ict", { diagnoses: [], cautions: [] })).toEqual([]);
  });
});
