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
  | "physio.exam"
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
  | "nursing.plan"
  | "profile.allergy"
  | "profile.infection"
  | "profile.contra"
  | "profile.body"
  | "profile.care"
  | "profile.blood"
  | "anamnesis"
  | "liaison"
  | "receipt"
  | "reception"
  | "opd.call"
  | "erx"
  | "clins"
  | "kitchen"
  | "kitchen.kenshoku"
  | "endo.desk"
  | "endo.doctor"
  | "team.request"
  | "team.round"
  | "team.decide"
  | "pressure";

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
  "physio.exam": { label: "生理検査の受付・実施・レポート", who: ["臨床検査技師"] },
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
  // 患者プロファイル: who registers what is the fictional hospital's rule (架空の病院の取り決め).
  "profile.allergy": { label: "アレルギーの登録・変更", who: ["医師", "看護師", "薬剤師", "管理栄養士"] },
  "profile.infection": { label: "感染症の登録・変更", who: ["医師", "看護師"] },
  "profile.contra": { label: "禁忌の登録・変更", who: ["医師", "薬剤師"] },
  "profile.body": { label: "身長・体重の登録", who: ["医師", "看護師", "管理栄養士"] },
  "profile.care": { label: "介助（移動・食事・排泄・入浴）の登録", who: ["看護師", "医師"] },
  "profile.blood": { label: "血液型の登録", who: ["医師", "臨床検査技師"] },
  anamnesis: { label: "入院時の情報収集（アナムネーシス）", who: ["看護師"] },
  liaison: { label: "紹介・逆紹介の台帳と返書の記録", who: ["MSW", "医事課"] },
  receipt: { label: "返戻・査定の取り込みと再請求の記録", who: ["医事課"] },
  reception: { label: "外来の受付", who: ["医事課", "看護師"] },
  "opd.call": { label: "診察の呼出", who: ["医師", "看護師"] },
  // 国のサービス（模擬）: the prescriber signs and registers; the doctor sends the documents and 臨床情報.
  erx: { label: "電子処方箋の重複投薬等チェック・署名・登録（模擬）", who: ["医師"] },
  clins: { label: "電子カルテ情報共有サービスへの送信と他院の情報の閲覧（模擬）", who: ["医師"] },
  // 給食・内視鏡室・チーム医療: who records what is the fictional hospital's rule (架空の病院の取り決め).
  kitchen: { label: "給食の記録（禁止食品・代わりの料理・発注・在庫）", who: ["管理栄養士"] },
  "kitchen.kenshoku": { label: "検食簿の記入", who: ["医師", "管理栄養士"] },
  "endo.desk": { label: "内視鏡室の予約・受付・前処置・鎮静中の観察・洗浄消毒の記録", who: ["看護師", "医師"] },
  "endo.doctor": { label: "内視鏡の実施記録・監視解除・レポート・病理への提出", who: ["医師"] },
  "team.request": { label: "チーム医療への依頼", who: ["医師"] },
  "team.round": { label: "チームの依頼の受付・回診の記録", who: ["医師", "看護師", "薬剤師", "臨床検査技師", "管理栄養士", "MSW"] },
  "team.decide": { label: "チームの提案の採用・不採用", who: ["医師"] },
  // 褥瘡対策の診療計画は褥瘡対策チームの専任の医師と専任の看護職員が作る（通知 別添2 第1の4(3)）。経過の記録は看護師と医師。
  pressure: { label: "褥瘡の評価（DESIGN-R®2020）・写真・褥瘡対策の診療計画書", who: ["看護師", "医師"] },
};

export const can = (role: Role, a: Action): boolean => RULES[a].who.includes(role);

/** Why the action is locked for this role, or null when it is allowed. */
export function denyReason(role: Role, a: Action): string | null {
  if (can(role, a)) return null;
  const r = RULES[a];
  return `${r.label}は${r.who.join("・")}が行います（いまは${role}で入っています）。`;
}
