// Who is using the chart. In this demo a person picks a role instead of logging in; each role
// gets its own first screen, its own ward tabs, and only the actions its job allows.
// The people are fictional.

export type Role = "医師" | "看護師" | "薬剤師" | "臨床検査技師" | "管理栄養士" | "MSW" | "医事課";

export const ROLES: Role[] = ["医師", "看護師", "薬剤師", "臨床検査技師", "管理栄養士", "MSW", "医事課"];

export interface Staff {
  role: Role;
  /** Name as written in the record and the audit log. */
  name: string;
}

export const STAFF: Record<Role, Staff> = {
  医師: { role: "医師", name: "山本（専攻医）" },
  看護師: { role: "看護師", name: "看護師 佐藤" },
  薬剤師: { role: "薬剤師", name: "薬剤師 小林" },
  臨床検査技師: { role: "臨床検査技師", name: "検査技師 中村" },
  管理栄養士: { role: "管理栄養士", name: "管理栄養士 高橋" },
  MSW: { role: "MSW", name: "MSW 伊藤" },
  医事課: { role: "医事課", name: "医事課 渡辺" },
};

/** What each role is called in full, for the first mention. */
export const ROLE_LONG: Record<Role, string> = {
  医師: "医師",
  看護師: "看護師",
  薬剤師: "薬剤師",
  臨床検査技師: "臨床検査技師",
  管理栄養士: "管理栄養士",
  MSW: "MSW（医療ソーシャルワーカー）",
  医事課: "医事課",
};

/** The ward-level tabs pinned before the patient tabs. */
export type PinnedTab = "map" | "list" | "sheet" | "handoff" | "admit" | "meals" | "lab" | "er" | "pharmacy" | "dialysis" | "or" | "acuity" | "chat" | "audit" | "iji";

/** The tabs each role sees, first one is where the role starts. */
export const TABS: Record<Role, PinnedTab[]> = {
  医師: ["map", "list", "handoff", "admit", "er", "or", "dialysis", "chat", "audit"],
  看護師: ["sheet", "map", "list", "handoff", "admit", "meals", "acuity", "er", "or", "dialysis", "chat"],
  薬剤師: ["pharmacy", "map", "list", "chat"],
  臨床検査技師: ["lab", "map", "list", "chat"],
  管理栄養士: ["meals", "admit", "map", "list", "chat"],
  MSW: ["admit", "map", "list", "chat"],
  医事課: ["iji", "list", "map", "audit"],
};

export const home = (r: Role): PinnedTab => TABS[r][0];

export type Action =
  | "order"
  | "order.verbal"
  | "order.sign"
  | "diagnosis"
  | "consent"
  | "directive"
  | "diet"
  | "discharge"
  | "vitals"
  | "mar"
  | "acuity"
  | "pharmacy"
  | "billing"
  | "insurance"
  | "settle"
  | "note"
  | "result.ack"
  | "panic.call"
  | "lab.receive"
  | "lab.result"
  | "blood.bank"
  | "tx.bedside"
  | "path.process"
  | "path.report"
  | "handoff"
  | "plan"
  | "assess.nursing"
  | "assess.nutrition"
  | "assess.discharge"
  | "er.register"
  | "er.admit"
  | "bed.assign"
  | "bed.move"
  | "restraint"
  | "nursing.plan";

const RULES: Record<Action, { label: string; who: Role[] }> = {
  order: { label: "オーダの確定", who: ["医師"] },
  "order.verbal": { label: "口頭指示の代行入力", who: ["看護師"] },
  "order.sign": { label: "口頭指示の承認・薬剤部への回答", who: ["医師"] },
  diagnosis: { label: "病名の登録", who: ["医師"] },
  consent: { label: "説明と同意の記録", who: ["医師"] },
  directive: { label: "事前指示の確定", who: ["医師"] },
  diet: { label: "食事の指示", who: ["医師"] },
  discharge: { label: "退院時サマリーと紹介状", who: ["医師"] },
  vitals: { label: "バイタルの記録", who: ["看護師", "医師"] },
  mar: { label: "与薬・実施の記録", who: ["看護師"] },
  acuity: { label: "看護必要度の評価", who: ["看護師"] },
  pharmacy: { label: "薬剤部の業務", who: ["薬剤師"] },
  billing: { label: "算定の入力", who: ["医事課", "医師"] },
  insurance: { label: "保険の登録", who: ["医事課"] },
  settle: { label: "会計の記録", who: ["医事課"] },
  note: { label: "記事の記録", who: ["医師", "看護師", "薬剤師", "臨床検査技師", "管理栄養士", "MSW"] },
  "result.ack": { label: "結果の確認", who: ["医師"] },
  "panic.call": { label: "パニック値の連絡", who: ["臨床検査技師"] },
  "lab.receive": { label: "検体の受付", who: ["臨床検査技師"] },
  "lab.result": { label: "検査結果の入力と確定", who: ["臨床検査技師"] },
  "blood.bank": { label: "輸血部門の業務（血液型・交差適合試験・入庫・割付・払出・返却・廃棄）", who: ["臨床検査技師"] },
  "tx.bedside": { label: "輸血の照合・観察・副反応の記録", who: ["看護師", "医師"] },
  "path.process": { label: "病理の受付と標本作製の記録", who: ["臨床検査技師"] },
  "path.report": { label: "病理診断の報告書（病理医）", who: ["医師"] },
  handoff: { label: "申し送り", who: ["看護師", "医師"] },
  plan: { label: "入院診療計画書の確定", who: ["医師"] },
  "assess.nursing": { label: "看護の評価（褥瘡・転倒転落・せん妄）", who: ["看護師"] },
  "assess.nutrition": { label: "栄養の評価と計画", who: ["管理栄養士", "看護師"] },
  "assess.discharge": { label: "退院支援", who: ["MSW", "看護師"] },
  "er.register": { label: "救急の受付", who: ["看護師", "医師"] },
  "er.admit": { label: "入院申込", who: ["医師"] },
  "bed.assign": { label: "ベッドを決めて入院を受けること", who: ["看護師", "医師"] },
  "bed.move": { label: "転棟・転床", who: ["医師", "看護師"] },
  restraint: { label: "身体的拘束の記録", who: ["医師", "看護師"] },
  "nursing.plan": { label: "看護計画と看護ケア指示の記録", who: ["看護師"] },
};

export const can = (role: Role, a: Action): boolean => RULES[a].who.includes(role);

/** Why the action is locked for this role, or null when it is allowed. */
export function denyReason(role: Role, a: Action): string | null {
  if (can(role, a)) return null;
  const r = RULES[a];
  return `${r.label}は${r.who.join("・")}が行います（いまは${role}で入っています）。`;
}
