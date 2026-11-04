// チーム医療 of the fictional hospital: the attending's request to a team (NST・ICT・緩和ケア・褥瘡・RST・認知症ケア・
// 精神科リエゾン), the team's worklist, the records of its rounds, and the team's proposals that the attending
// adopts or not — the doctor decides; the team proposes; code never does either. Where a team has a fee
// (加算), its conditions are shown as the 告示 and 通知 write them, with what the record shows (病名・食事の
// 指示) and how many rounds there were this week. Whether a patient meets a condition is for people to judge.

import type { DayOffset } from "./types";

export const TEAM_SOURCES = [
  {
    label: "診療報酬の算定方法の一部を改正する件（令和8年厚生労働省告示第69号）別表第一 医科診療報酬点数表 A226-2・A230-4・A233-2・A234-2・A236・A242・A247",
    url: "https://www.mhlw.go.jp/content/12400000/001686842.pdf",
  },
  {
    label: "厚生労働省「診療報酬の算定方法の一部改正に伴う実施上の留意事項について」（令和8年3月5日 保医発0305第6号）別添1 通則6（週は日曜日から土曜日）、A226-2・A230-4・A233-2・A236・A242・A247",
    url: "https://www.mhlw.go.jp/content/12400000/001757385.pdf",
  },
  {
    label: "厚生労働省「基本診療料の施設基準等及びその届出に関する手続きの取扱いについて」（令和8年3月5日 保医発0305第7号）別添3 第19 栄養サポートチーム加算",
    url: "https://www.mhlw.go.jp/content/12400000/001757361.pdf",
  },
] as const;

/** The fictional hospital's rules (shown as such). */
export const TEAM_HOUSE_RULES = {
  filed: "この架空の病院は、ここに挙げた加算をすべて届け出ているものとします（架空）。チームの人は架空です。",
  request: "チームへの依頼は医師（主治医）が出し、チームの提案を採用するかは医師が決めて記録します（この架空の病院の取り決め）。",
  billing: "加算を算定するかは、条件を確かめて医師と医事課が決めます。この画面は算定しません。",
} as const;

export type TeamKey = "nst" | "ict" | "pc" | "pu" | "rst" | "dementia" | "liaison";

export interface Addon {
  code: string;
  name: string;
  /** 点数 as the 告示 writes it. */
  points: string;
  /** How often: 週1回・1日につき・入院中1回. */
  limit: "週1回" | "1日につき" | "入院中1回";
  /** Who it is for (the 通知's words, shortened). */
  who: string[];
  notes: string[];
}

export interface Team {
  key: TeamKey;
  name: string;
  /** The name in full (略語の正式名称). */
  long: string;
  /** What the team helps with. */
  what: string;
  members: { name: string; job: string }[];
  addon?: Addon;
  /** Why there is no per-patient fee. */
  noAddon?: string;
  /** The team's make-up in the 施設基準 (when verified). */
  staffing?: string;
}

export const TEAMS: Team[] = [
  {
    key: "nst",
    name: "NST",
    long: "栄養サポートチーム（NST：Nutrition Support Team）",
    what: "低栄養・経管栄養・静脈栄養の患者の栄養の評価と計画",
    members: [
      { name: "内科 吉田（架空）", job: "医師" },
      { name: "看護師 斎藤（架空）", job: "看護師" },
      { name: "薬剤師 小林", job: "薬剤師" },
      { name: "管理栄養士 高橋", job: "管理栄養士" },
      { name: "言語聴覚士 森田（架空）", job: "言語聴覚士" },
    ],
    addon: {
      code: "A233-2",
      name: "栄養サポートチーム加算",
      points: "200点",
      limit: "週1回",
      who: [
        "栄養管理計画を策定している患者のうち、次のアからエまでのいずれかに該当する者",
        "ア 栄養スクリーニングの結果を踏まえ、GLIM 基準による栄養評価で低栄養と判定された患者",
        "イ 経口摂取又は経腸栄養への移行を目的として、現に静脈栄養法を実施している患者",
        "ウ 経口摂取への移行を目的として、現に経腸栄養法を実施している患者",
        "エ 栄養サポートチームが、栄養治療により改善が見込めると判断した患者",
      ],
      notes: [
        "1日当たりの算定患者数は、1チームにつき概ね30人以内",
        "カンファレンスと回診を週1回程度。栄養治療実施計画（別紙様式5）を作り、患者等に説明して交付する",
        "入院栄養食事指導料・集団栄養食事指導料・乳幼児育児栄養指導料は別に算定できない（注1）",
      ],
    },
    staffing: "栄養管理に係る所定の研修を修了した専任の常勤医師・常勤看護師・常勤薬剤師・常勤管理栄養士（いずれか1人は専従。1日15人以内なら全員専任でよい）",
  },
  {
    key: "ict",
    name: "ICT",
    long: "感染制御チーム（ICT：Infection Control Team）",
    what: "耐性菌・感染症の患者の感染対策と抗菌薬の相談",
    members: [
      { name: "感染症内科 中島（架空）", job: "医師" },
      { name: "感染管理認定看護師 松本（架空）", job: "看護師" },
      { name: "薬剤師 小林", job: "薬剤師" },
      { name: "検査技師 中村", job: "臨床検査技師" },
    ],
    noAddon: "患者ごとの依頼で算定する加算はありません。感染対策向上加算（A234-2）は病院の体制の加算で、入院初日に算定します（加算1 710点・加算2 175点・加算3 75点）。",
  },
  {
    key: "pc",
    name: "緩和ケア",
    long: "緩和ケアチーム",
    what: "痛み・息苦しさなどの症状と、不安・抑うつなどのつらさ",
    members: [
      { name: "緩和ケア内科 西村（架空）", job: "医師（身体症状）" },
      { name: "精神科 原田（架空）", job: "医師（精神症状）" },
      { name: "緩和ケア認定看護師 前田（架空）", job: "看護師" },
      { name: "薬剤師 小林", job: "薬剤師" },
    ],
    addon: {
      code: "A226-2",
      name: "緩和ケア診療加算",
      points: "390点",
      limit: "1日につき",
      who: [
        "一般病床に入院する悪性腫瘍、後天性免疫不全症候群、末期心不全、末期呼吸器疾患又は末期腎不全の患者のうち、疼痛、倦怠感、呼吸困難等の身体的症状又は不安、抑うつなどの精神症状を持つ者",
        "当該患者の同意に基づき、緩和ケアチームによる診療が行われた場合",
        "末期心不全・末期呼吸器疾患・末期腎不全は、留意事項通知 (2)〜(4) の基準に該当するもの",
      ],
      notes: ["初回の診療で緩和ケア診療実施計画書（別紙様式3）を作り、患者に説明して交付する", "1日当たりの算定患者数は、1チームにつき概ね30人以内", "15歳未満は小児加算 100点（注3）"],
    },
  },
  {
    key: "pu",
    name: "褥瘡",
    long: "褥瘡対策チーム",
    what: "褥瘡の予防と治療が難しい患者の計画とケア",
    members: [
      { name: "皮膚科 岡本（架空）", job: "医師" },
      { name: "皮膚・排泄ケア認定看護師 村上（架空）", job: "看護師（専従の褥瘡管理者）" },
      { name: "管理栄養士 高橋", job: "管理栄養士" },
    ],
    addon: {
      code: "A236",
      name: "褥瘡ハイリスク患者ケア加算",
      points: "500点",
      limit: "入院中1回",
      who: [
        "ベッド上安静であって、次のいずれかに該当する者",
        "ア ショック状態 イ 重度の末梢循環不全 ウ 麻薬等の鎮痛・鎮静剤の持続的な使用が必要 エ 6時間以上の全身麻酔下による手術を受けた オ 特殊体位による手術を受けた",
        "カ 強度の下痢が続く キ 極度の皮膚の脆弱（低出生体重児、GVHD、黄疸等） ク 皮膚に密着させる医療関連機器の長期かつ持続的な使用が必要 ケ 褥瘡に関する危険因子（病的骨突出、皮膚湿潤、浮腫等）があって既に褥瘡を有する",
      ],
      notes: ["専従の褥瘡管理者が、予防治療計画に基づく総合的な褥瘡対策を継続して実施した場合に、入院期間中1回"],
    },
  },
  {
    key: "rst",
    name: "RST",
    long: "呼吸ケアチーム（RST：Respiration Support Team）",
    what: "人工呼吸器からの離脱",
    members: [
      { name: "集中治療科 藤井（架空）", job: "医師" },
      { name: "看護師 清水（架空）", job: "看護師" },
      { name: "臨床工学技士 山崎（架空）", job: "臨床工学技士" },
      { name: "理学療法士 池田（架空）", job: "理学療法士" },
    ],
    addon: {
      code: "A242",
      name: "呼吸ケアチーム加算",
      points: "150点",
      limit: "週1回",
      who: ["48時間以上継続して人工呼吸器を装着している患者であって、人工呼吸器を装着している状態で当該病棟に入院した日から1月以内の患者、又は当該病棟に入院した後人工呼吸器を装着し、装着日から1月以内の患者"],
      notes: ["初回の診療で診療計画書を作り、人工呼吸器離脱のための診療と評価を行う", "医療機器安全管理料の1は別に算定できない"],
    },
  },
  {
    key: "dementia",
    name: "認知症ケア",
    long: "認知症ケアチーム",
    what: "認知症の行動・心理症状や意思疎通の難しさが治療に影響する患者のケア",
    members: [
      { name: "脳神経内科 長谷川（架空）", job: "医師" },
      { name: "認知症看護認定看護師 石井（架空）", job: "看護師" },
      { name: "MSW 伊藤", job: "社会福祉士" },
    ],
    addon: {
      code: "A247",
      name: "認知症ケア加算１",
      points: "イ 14日以内の期間 186点、ロ 15日以上の期間 39点",
      limit: "1日につき",
      who: ["「認知症高齢者の日常生活自立度判定基準」のランクⅢ以上に該当する患者", "重度の意識障害のある者（JCS Ⅱ-3（又は30）以上、又は GCS 8点以下）を除く"],
      notes: ["認知症ケアチームが当該患者に関与し始めた日から算定し、入院した日から数えた期間で点数が分かれる", "身体的拘束を実施した日は、所定点数の100分の20（注2）", "精神科リエゾンチーム加算（認知症ケア加算1を算定する場合）・せん妄ハイリスク患者ケア加算は別に算定できない（注1）"],
    },
  },
  {
    key: "liaison",
    name: "精神科リエゾン",
    long: "精神科リエゾンチーム",
    what: "せん妄・抑うつ・精神疾患・自殺企図で入院した患者の精神症状",
    members: [
      { name: "精神科 原田（架空）", job: "医師" },
      { name: "精神看護専門看護師 桑原（架空）", job: "看護師" },
      { name: "公認心理師 宮本（架空）", job: "公認心理師" },
      { name: "精神保健福祉士 遠藤（架空）", job: "精神保健福祉士" },
    ],
    addon: {
      code: "A230-4",
      name: "精神科リエゾンチーム加算",
      points: "1 認知症又はせん妄の場合 300点、2 それ以外の場合 700点",
      limit: "週1回",
      who: ["せん妄や抑うつを有する患者、精神疾患を有する患者、自殺企図で入院した患者"],
      notes: ["「2」について週2回以上診療した場合は、複数回診療加算として週1回に限り300点（注2）", "1週間当たりの算定患者数は、1チームにつき概ね30人以内", "初回に診療実施計画書（別紙様式29の2）を作り、患者等に説明して診療録等に添付する", "認知症ケア加算1とは別に算定できない"],
    },
  },
];

export const teamOf = (k: TeamKey) => TEAMS.find((t) => t.key === k)!;

export interface Moment {
  day: DayOffset;
  time: string;
}

export interface TeamRequest {
  id: string;
  team: TeamKey;
  patientId: string;
  /** 依頼の理由・相談したいこと. */
  reason: string;
  urgency: "通常" | "至急";
  by: string;
  at: Moment;
  /** The team took the request (初回の介入を始めた). */
  accepted?: Moment & { by: string };
  /** The team ended its work (終了・退院). */
  closed?: Moment & { by: string; summary: string };
}

export interface TeamRec {
  id: string;
  text: string;
  /** The attending's decision: 採用 or 不採用 (with the reason). */
  decision?: { adopt: boolean; reason?: string; by: string; at: Moment };
}

export interface TeamRound {
  id: string;
  requestId: string;
  team: TeamKey;
  patientId: string;
  at: Moment;
  by: string;
  members: string[];
  /** 評価・所見. */
  assessment: string;
  recs: TeamRec[];
}

export interface TeamDesk {
  requests: TeamRequest[];
  rounds: TeamRound[];
}

export const EMPTY_TEAMS: TeamDesk = { requests: [], rounds: [] };

export type RequestStatus = "依頼中" | "介入中" | "終了";
export const requestStatus = (r: TeamRequest): RequestStatus => (r.closed ? "終了" : r.accepted ? "介入中" : "依頼中");

/** The patient's request to the team that is still open, if any (a second one is not made). */
export const openRequest = (desk: TeamDesk, team: TeamKey, patientId: string) => desk.requests.find((r) => r.team === team && r.patientId === patientId && !r.closed);

export function requestProblems(f: { reason: string }, open: TeamRequest | undefined): string[] {
  const out: string[] = [];
  if (open) out.push("このチームへの依頼がもうあります（終了してから出し直します）。");
  if (!f.reason.trim()) out.push("依頼の理由・相談したいこと");
  return out;
}

export function roundProblems(f: { members: string[]; assessment: string }, r: TeamRequest): string[] {
  const out: string[] = [];
  if (!r.accepted) out.push("先に依頼を受けてください。");
  if (r.closed) out.push("終了した依頼です。");
  if (!f.members.length) out.push("参加した人");
  if (!f.assessment.trim()) out.push("評価・所見");
  return out;
}

/** Sunday of the week of `day` (the 通知's week runs Sunday to Saturday); `dow` gives the weekday of a day offset. */
export const weekStartOf = (day: number, dow: (d: number) => number) => day - dow(day);

/** Rounds of the request in the week of `day`. */
export function roundsInWeek(desk: TeamDesk, requestId: string, day: number, dow: (d: number) => number): TeamRound[] {
  const from = weekStartOf(day, dow);
  return desk.rounds.filter((r) => r.requestId === requestId && r.at.day >= from && r.at.day <= from + 6);
}

/** Proposals the attending has not decided yet, for a patient (or all). */
export function undecided(desk: TeamDesk, patientId?: string): { round: TeamRound; rec: TeamRec }[] {
  return desk.rounds.filter((r) => !patientId || r.patientId === patientId).flatMap((round) => round.recs.filter((rec) => !rec.decision).map((rec) => ({ round, rec })));
}

/** The team's open requests, 依頼中 first, then 至急, then oldest. */
export function worklist(desk: TeamDesk, team: TeamKey, withClosed = false): TeamRequest[] {
  const rank: Record<RequestStatus, number> = { 依頼中: 0, 介入中: 1, 終了: 2 };
  const t = (m: Moment) => m.day * 1440 + Number(m.time.slice(0, 2)) * 60 + Number(m.time.slice(3, 5));
  return desk.requests
    .filter((r) => r.team === team && (withClosed || !r.closed))
    .sort((a, b) => rank[requestStatus(a)] - rank[requestStatus(b)] || (a.urgency === "至急" ? 0 : 1) - (b.urgency === "至急" ? 0 : 1) || t(a.at) - t(b.at));
}

/** What the fee's limit says about this week (or this stay), in words. Not a decision to bill. */
export function limitNote(team: Team, desk: TeamDesk, r: TeamRequest, today: number, dow: (d: number) => number, admittedOn: number): string | null {
  const a = team.addon;
  if (!a) return null;
  if (a.limit === "週1回") {
    const n = roundsInWeek(desk, r.id, today, dow).length;
    const extra = team.key === "liaison" && n >= 2 ? "。「2」なら週2回以上で複数回診療加算の条件" : "";
    return `今週（日〜土）の回診 ${n}回：${a.name}は週1回まで${extra}`;
  }
  if (a.limit === "入院中1回") {
    const n = desk.rounds.filter((x) => x.requestId === r.id).length;
    return `回診 ${n}回：${a.name}は入院中1回まで`;
  }
  // 1日につき (認知症ケア加算１ は入院した日から数えて14日以内・15日以上で分かれる)
  if (team.key === "dementia") {
    const hd = today - admittedOn + 1;
    return `入院${hd}日目：${hd <= 14 ? "イ 14日以内の期間" : "ロ 15日以上の期間"}。チームが関与し始めた日から算定`;
  }
  return `${a.name}は1日につき（チームの診療が行われた日）`;
}

export interface Fact {
  text: string;
  /** seen = the record shows it; check = people must check it (the record cannot tell). */
  kind: "seen" | "check";
}

const CANCER = /癌|がん|腫瘍|肉腫|白血病|リンパ腫|骨髄腫/;

/** What the record shows about the fee's conditions (病名・食事の指示・注意), and what must be checked by people. */
export function factsFor(team: TeamKey, ctx: { diagnoses: string[]; dietKind?: string; cautions: string[] }): Fact[] {
  const dx = (re: RegExp) => ctx.diagnoses.filter((d) => re.test(d));
  const out: Fact[] = [];
  switch (team) {
    case "nst":
      if (ctx.dietKind === "経管栄養") out.push({ text: "食事の指示が経管栄養（ウ「経口摂取への移行を目的として、現に経腸栄養法を実施」に当たるかを確かめる）", kind: "seen" });
      if (ctx.dietKind === "絶食") out.push({ text: "食事の指示が絶食（静脈栄養を行っているなら イ に当たるかを確かめる）", kind: "seen" });
      out.push({ text: "栄養管理計画の策定と、GLIM 基準による評価（ア）はチームが確かめる", kind: "check" });
      break;
    case "pc": {
      const c = dx(CANCER);
      if (c.length) out.push({ text: `病名に ${c.join("・")}（悪性腫瘍）`, kind: "seen" });
      const hf = dx(/心不全/);
      if (hf.length) out.push({ text: `病名に ${hf.join("・")}（末期心不全なら留意事項通知 (2) のアからウ及びエからカのいずれかを確かめる）`, kind: "seen" });
      const resp = dx(/呼吸不全|慢性閉塞性肺疾患|COPD|間質性肺炎/);
      if (resp.length) out.push({ text: `病名に ${resp.join("・")}（末期呼吸器疾患なら (3) を確かめる）`, kind: "seen" });
      const kid = dx(/腎不全|慢性腎臓病/);
      if (kid.length) out.push({ text: `病名に ${kid.join("・")}（末期腎不全なら (4) を確かめる）`, kind: "seen" });
      if (!c.length && !hf.length && !resp.length && !kid.length) out.push({ text: "対象の病名（悪性腫瘍・後天性免疫不全症候群・末期心不全・末期呼吸器疾患・末期腎不全）が病名の一覧に見当たらない", kind: "seen" });
      out.push({ text: "症状と、患者の同意を確かめる", kind: "check" });
      break;
    }
    case "liaison": {
      const one = dx(/せん妄|認知症/);
      const two = dx(/うつ|統合失調|双極|不安障害|適応障害|自殺|アルコール依存/);
      if (one.length) out.push({ text: `病名に ${one.join("・")}（区分は「1 認知症又はせん妄」に当たるかを確かめる）`, kind: "seen" });
      if (two.length) out.push({ text: `病名に ${two.join("・")}（区分は「2 それ以外」に当たるかを確かめる）`, kind: "seen" });
      out.push({ text: "せん妄・抑うつ・精神疾患・自殺企図のどれに当たるかはチームが確かめる", kind: "check" });
      break;
    }
    case "dementia": {
      const dm = [...dx(/認知症/), ...ctx.cautions.filter((c) => /認知症/.test(c))];
      if (dm.length) out.push({ text: `病名・注意に ${[...new Set(dm)].join("・")}`, kind: "seen" });
      out.push({ text: "日常生活自立度ランクⅢ以上か、重度の意識障害（JCS Ⅱ-3以上・GCS 8点以下）でないかを確かめる", kind: "check" });
      break;
    }
    case "pu": {
      const pu = dx(/褥瘡/);
      if (pu.length) out.push({ text: `病名に ${pu.join("・")}（ケ「危険因子があって既に褥瘡を有する」に当たるかを確かめる）`, kind: "seen" });
      out.push({ text: "ベッド上安静か、ア〜ケのどれに当たるかを確かめる", kind: "check" });
      break;
    }
    case "rst":
      out.push({ text: "人工呼吸器の装着の記録はこのカルテにありません。装着の時刻（48時間以上）と、入院・装着から1月以内かを確かめる", kind: "check" });
      break;
    case "ict":
      break;
  }
  return out;
}

/** The fictional requests the demo starts with: NST for 大浦さん (seen once), ICT for 佐倉さん (not taken yet). */
export function initialTeams(): TeamDesk {
  const DR = "山本（専攻医）";
  return {
    requests: [
      {
        id: "team-demo-1",
        team: "nst",
        patientId: "90010244",
        reason: "誤嚥性肺炎で入院し絶食。86歳、BMI 19.5。経口摂取の再開に向けて、栄養の評価と計画を相談したい。",
        urgency: "通常",
        by: DR,
        at: { day: -1, time: "13:00" },
        accepted: { day: -1, time: "15:00", by: "管理栄養士 高橋" },
      },
      {
        id: "team-demo-2",
        team: "ict",
        patientId: "90010231",
        reason: "MRSA 菌血症（血液培養）。接触予防策の範囲と、抗菌薬の期間について相談したい。",
        urgency: "至急",
        by: DR,
        at: { day: -1, time: "18:00" },
      },
    ],
    rounds: [
      {
        id: "round-demo-1",
        requestId: "team-demo-1",
        team: "nst",
        patientId: "90010244",
        at: { day: -1, time: "16:00" },
        by: "管理栄養士 高橋",
        members: ["内科 吉田（架空）", "看護師 斎藤（架空）", "薬剤師 小林", "管理栄養士 高橋"],
        assessment: "入院1日目。絶食で、末梢からの輸液のみ。身長145cm・体重41kg（BMI 19.5）。嚥下の評価は主治医が依頼済み。",
        recs: [
          { id: "rec-demo-1", text: "体重を週1回測って記録する", decision: { adopt: true, by: DR, at: { day: -1, time: "17:00" } } },
          { id: "rec-demo-2", text: "嚥下の評価の結果が出たら、ゼリー（嚥下調整食 コード0j）からの再開を検討する" },
        ],
      },
    ],
  };
}
