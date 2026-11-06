// テンプレート（型のある記録）: records with a fixed shape — 身体的拘束, 救急医療管理加算の根拠, 入院診療計画の
// 説明, IC, 転倒, せん妄, 急変, 死亡, 褥瘡, 輸血, 口頭指示 … Each is a form (choices, checks, numbers, times,
// free text) that becomes one note in a fixed wording, headed 【テンプレート名】. The form is written in the
// same token syntax as 記事のテンプレート (note-templates.ts), so a person's own templates are shared between
// the two: one made here is offered in the note box too, and the other way round. The wording is put
// together by code; whether a requirement (an 加算, a restraint) is met is the doctor's decision. Nothing is
// written or summarised by AI. Data is fictional.

import { PADUA_ITEMS, VTE_SOURCES, paduaText, vtePrefill } from "./record-vte";
import type { StandingOrders } from "./standing";
import { emergencyPrefill, icuPrefill, SOFA_ITEMS, SOFA_SOURCE, sofaTotal } from "./record-sofa";
import { DELIRIUM_MEASURES, DELIRIUM_RISKS } from "./admit-eval";
import { BLOOD_SOURCES } from "./blood-bank";
import { DISCHARGE_PLAN_SOURCE } from "./documents";
import { FALL_SOURCES } from "./fall-reassess";
import { fieldKey, fillTemplate, loadMyTemplates, parseTemplate, saveMyTemplates, startValues, unanswered, type NoteTemplate, type TemplateFacts, type TemplateValues } from "./note-templates";
import { PRESSURE_SOURCES, SITES, designText, designTotal, latestOf, type PressureUlcer } from "./pressure-course";
import { DEVICES, RESTRAINT_SOURCES, type Restraint } from "./restraint";
import type { Role } from "./roles";
import type { Patient } from "./types";

export { loadMyTemplates as loadMyRecordTemplates, saveMyTemplates as saveMyRecordTemplates };

export const RECORD_SOURCES = {
  ryuui: { label: "厚生労働省保険局医療課長通知 保医発0305第4号（令和6年3月5日）別添1 医科診療報酬点数表に関する事項", url: DISCHARGE_PLAN_SOURCE.url },
  kisoku: { label: "医療法施行規則 第1条の5（入院診療計画書に記載する事項）", url: "https://laws.e-gov.go.jp/law/323M40000100050" },
  iryoho: { label: "医療法 第1条の4 第2項（医療を提供するに当たり適切な説明を行い、医療を受ける者の理解を得るよう努める）", url: "https://laws.e-gov.go.jp/law/323AC0000000205" },
  death: { label: "厚生労働省「死亡診断書（死体検案書）記入マニュアル」", url: "https://www.mhlw.go.jp/toukei/manual/" },
};

/** Where the formal record of the same thing lives; the form here is the note, not a second record. */
export type LinkedPanel = "restraint" | "pressure";

/** What a template may read from the chart to start its form (code fills; the writer can change anything). */
export interface RecordFacts extends TemplateFacts {
  patient: TemplateFacts["patient"] & Pick<Patient, "name" | "attending"> & Partial<Pick<Patient, "admissionDiagnosis">>;
  me: { name: string; role: Role };
  nowTime: string;
  standing?: StandingOrders;
  /** The restraint in force, if any. */
  restraint?: Restraint | null;
  /** The pressure ulcers not yet healed. */
  ulcers?: PressureUlcer[];
}

export interface RecordTemplate extends NoteTemplate {
  /** The name on the rail's お気に入り tile (short). */
  short: string;
  /** What it is for, one line. */
  about: string;
  /** Free-text fields (文) that must not stay empty. Choices, numbers and times are always required. */
  required?: string[];
  hint?: string;
  /** The record this goes with: opened from the form so nothing is recorded twice. */
  link?: { panel: LinkedPanel; label: string };
  sources?: { label: string; url: string }[];
  /** 架空の病院の取り決め: what the hospital itself decided about this form. */
  rule?: string;
  /** Starting values worked out from the chart. */
  prefill?: (f: RecordFacts) => TemplateValues;
}

const yesNo = (label: string, yes: string, no: string) => `{{選択:${label}:${yes}|${no}}}`;
const KYUKYU_STATES = [
  "ア 吐血、喀血又は重篤な脱水で全身状態不良の状態",
  "イ 意識障害又は昏睡",
  "ウ 呼吸不全又は心不全で重篤な状態",
  "エ 急性薬物中毒",
  "オ ショック",
  "カ 重篤な代謝障害（肝不全、腎不全、重症糖尿病等）",
  "キ 広範囲熱傷、顔面熱傷又は気道熱傷",
  "ク 外傷、破傷風等で重篤な状態",
  "ケ 緊急手術、緊急カテーテル治療・検査又はt-PA療法を必要とする状態",
  "コ 消化器疾患で緊急処置を必要とする重篤な状態",
  "サ 蘇生術を必要とする重篤な状態",
  "シ その他の重症な状態",
];
export const KYUKYU_STATE_OPTIONS = KYUKYU_STATES;

const doctorName = (f: RecordFacts) => (f.me.role === "医師" ? f.me.name : f.patient.attending);

/** The fictional hospital's record templates (架空の病院の取り決め). */
export const BUILTIN_RECORD_TEMPLATES: RecordTemplate[] = [
  {
    id: "rec-vte", name: "VTE（静脈血栓塞栓症）リスク評価", short: "VTE リスク",
    about: "内科入院患者の Padua 合計・日本のリスクレベル・予防の実施状況",
    roles: ["医師", "看護師"], sources: VTE_SOURCES,
    hint: "Padua Prediction Score は内科入院患者の評価です。Barbar S et al. J Thromb Haemost 2010;8:2450–2457 の閾値は4点以上＝高リスク。合計は11項目を選ぶとコードで計算します。年齢・BMI・入院病名を仮入力します。ベッド上の指示だけでは3日以上か分からないため、期間を確認して臥床を選んでください。配点と定義は公的資料 AHRQ Appendix B.12 と照合しました。原著本文はこの環境では取得できていないため、人が出典を確かめてください。活動性癌・血栓性素因などの定義も確認します。日本のリスクレベルは Padua から変換しません。推奨される予防法の表は出典 URL（2017年改訂版 第V章 予防・表39〜41、p.70）で人が確かめる必要があります。アプリは予防法を勧めません。決めるのは医師。",
    rule: "模擬の記録です。",
    body: [
      "評価日：{{日付}}　評価者：{{文:評価者}}",
      "カルテからの引用（確認して直す）：{{文:引用した情報}}",
      "臥床の期間の確認：{{文:臥床の確認}}",
      ...PADUA_ITEMS.map(([label, points]) => `Padua ${label}（${points}点）：{{選択:Padua ${label}:あり|なし}}`),
      "日本のガイドラインのリスクレベル：{{選択:リスクレベル:低|中|高|最高}}",
      "付加的な危険因子：{{選択:付加的な危険因子:あり（詳細を記載）|なし|未確認}}　{{文:付加的な危険因子の詳細}}",
      "リスクレベルの判断の根拠：{{文:判断の根拠}}",
      "予防の実施状況：{{複数:予防の実施状況:早期離床|弾性ストッキング|間欠的空気圧迫法|抗凝固薬|なし}}",
      "再評価の予定：{{選択:再評価の予定:翌日|状態が変わったとき|手術の前後|別に日付を指定}}　{{文:再評価日・補足}}",
      "医師の判断・指示：{{文:医師の判断・指示}}",
    ].join("\n"), prefill: vtePrefill,
  },

  {
    id: "rec-restraint",
    name: "身体的拘束の記録",
    short: "身体的拘束",
    about: "用具・時間・心身の状況・やむを得ない理由・三つの要件・観察・説明と同意",
    roles: ["医師", "看護師"],
    link: { panel: "restraint", label: "身体的拘束の記録（開始・見直し・解除）を開く" },
    sources: [RESTRAINT_SOURCES.rule, { label: RESTRAINT_SOURCES.guide.label, url: RESTRAINT_SOURCES.guide.url }],
    rule: "開始・見直し・解除そのものは「身体的拘束」の記録で行い、この記事はその日の観察と説明を残します（二重に記録しません）。観察の項目はこの病院の取り決めです。",
    required: ["心身の状況", "緊急やむを得ない理由"],
    body: [
      `用具：{{複数:用具:${DEVICES.join("|")}}}`,
      "開始：{{時刻:開始時刻}}　解除：{{選択:解除:まだ（継続中）|この記録で解除}}　解除時刻：{{文:解除時刻}}",
      "心身の状況：{{文:心身の状況}}",
      "緊急やむを得ない理由：{{文:緊急やむを得ない理由}}",
      `三つの要件：切迫性 ${yesNo("切迫性", "満たす", "満たさない")}、非代替性 ${yesNo("非代替性", "満たす", "満たさない")}、一時性 ${yesNo("一時性", "満たす", "満たさない")}`,
      "代わりに試したこと：{{文:代わりに試したこと}}",
      "観察：{{複数:観察:皮膚の損傷なし|循環障害なし|呼吸の抑制なし|体位の変換を行った|排泄の介助を行った|水分・食事をとれた|精神的な苦痛への対応を行った}}　{{文:観察の補足}}",
      "説明と同意：{{選択:説明と同意:本人・家族に説明し同意を得た|家族に電話で説明した|説明がまだ（理由を書く）}}　{{文:説明の相手と内容}}",
      "指示医：{{文:指示医}}　確認者：{{文:確認者}}",
      "次の見直し：{{選択:次の見直し:次の勤務帯で|解除したので不要}}",
    ].join("\n"),
    prefill: (f) => {
      const r = f.restraint;
      return {
        ...(r ? { "複数:用具": r.devices.filter((d) => (DEVICES as readonly string[]).includes(d)), "時刻:開始時刻": r.start.time, "文:指示医": r.doctor, "文:代わりに試したこと": r.tried, "文:緊急やむを得ない理由": r.why } : {}),
        "文:確認者": f.me.name,
      };
    },
  },
  {
    id: "rec-kyukyu",
    name: "救急医療管理加算の根拠",
    short: "救急加算",
    about: "入院時の状態の区分（ア〜シ）・根拠となる所見と数値・行った診療・判断した医師",
    roles: ["医師"],
    sources: [{ label: `${RECORD_SOURCES.ryuui.label} A205 救急医療管理加算`, url: RECORD_SOURCES.ryuui.url }],
    hint: "数値・所見の例：ア Hb・脱水の所見、イ JCS/GCS、ウ P/F・SpO2・BNP、エ 原因薬物・摂取量・血中濃度、オ 収縮期血圧・乳酸、カ 血糖・pH・Cre、キ 熱傷の範囲・部位、ク 損傷部位・出血量、ケ 緊急治療の内容と時刻、コ 処置の内容と所見、サ 蘇生の内容と時刻、シ 重症と判断した所見。算定の閾値ではありません。引用した最新値が入院時の値か確認し、必要な数値を残してください。",
    rule: "留意事項の「入院時に」の趣旨に沿い、入院時の状態を入院から3日以内に記録します。加算の要件を満たすかは医師・医事課が判断します。この記事は根拠を残すもので、算定の入力は「算定」で人が行います（文はコードで組みます）。",
    required: ["根拠となる所見"],
    body: [
      `入院時の状態（区分）：{{選択:区分:${KYUKYU_STATES.join("|")}}}`,
      "根拠となる所見：{{文:根拠となる所見}}",
      "根拠となる数値（JCS・収縮期血圧・P/F比・SpO2・検査値など）：{{文:根拠となる数値}}",
      "入院時に行った・予定した診療：{{文:行った診療}}",
      "加算：{{選択:加算:１（重篤な状態）|２（重篤な状態に準ずる）}}",
      "判断した医師：{{文:判断した医師}}",
    ].join("\n"),
    prefill: (f) => ({ "文:判断した医師": doctorName(f), "文:根拠となる数値": emergencyPrefill(f) }),
  },
  {
    id: "rec-icu-admit",
    name: "ICU 入室時の記録",
    short: "ICU入室",
    about: "入室の理由・状態・SOFA スコア・デバイス・指示・家族への説明",
    roles: ["医師", "看護師"],
    sources: [SOFA_SOURCE],
    rule: "入室後24時間以内に記録します。算定は医師・医事課が判断します。外への報告は行わない模擬の記録です。",
    hint: "SOFA は臓器ごとの状態を点数で残します。合計は6項目を選ぶとコードで計算します。血小板とビリルビンは引用した最新値からの仮の点です。血小板は出典の表にある境界（15・10・5・2万/μL以下）で計算します。ビリルビンが12.0の場合は出典の表で境界が明記されていないため、人が点を確認します。入室時の値・測定日を確かめて直してください。呼吸補助・昇圧薬・GCS・尿量は人が確認します。令和6年度の入室日・退室日の報告要件の通知の出典は人が確かめる必要があります。退室日の評価は別に残してください。",
    required: ["入室の理由"],
    body: [
      "入室日時：{{日付}} {{時刻:入室時刻}}　入室元：{{選択:入室元:救急外来|病棟|手術室|他院}}",
      "入室の理由：{{文:入室の理由}}",
      "主病名と入室時の問題：{{文:主病名と入室時の問題}}",
      "意識：GCS E {{選択:GCS E:1|2|3|4}} / V {{選択:GCS V:1|2|3|4|5|評価できない}} / M {{選択:GCS M:1|2|3|4|5|6}}",
      "呼吸：{{選択:呼吸:自発呼吸|酸素|NPPV/HFNC|人工呼吸}}　FiO2：{{文:FiO2}}　PaO2 または SpO2：{{文:PaO2 または SpO2}}",
      "循環：{{文:血圧}}　昇圧薬の有無・薬名・量：{{文:昇圧薬}}",
      "腎：{{文:Cre}}　尿量（測定期間も記載）：{{文:尿量}}",
      "肝：{{文:T-Bil}}　凝固：{{文:Plt}}",
      ...SOFA_ITEMS.map((item) => `SOFA ${item}：{{選択:SOFA ${item}:0|1|2|3|4}}`),
      "デバイス：{{複数:デバイス:気管チューブ|人工呼吸器|中心静脈カテーテル|動脈ライン|尿道カテーテル|胃管|ドレーン|なし}}",
      "持続薬：{{文:持続薬}}",
      "入室時の指示：鎮静目標 RASS {{選択:RASS:-5|-4|-3|-2|-1|0|+1|+2|+3|+4}}",
      "血糖の目標：{{文:血糖の目標}}　体位：{{文:体位}}",
      "DVT 予防：{{文:DVT 予防}}　ストレス潰瘍予防：{{文:ストレス潰瘍予防}}　栄養の開始：{{文:栄養の開始}}",
      "DNAR／事前指示：{{選択:DNAR／事前指示:確認した：あり|確認した：なし|未確認}}",
      "家族への説明（誰に・いつ・内容）：{{文:家族への説明}}",
      "担当医：{{文:担当医}}",
    ].join("\n"),
    prefill: (f) => ({ ...icuPrefill(f), "文:担当医": doctorName(f) }),
  },
  {
    id: "rec-plan",
    name: "入院診療計画の説明",
    short: "入院計画",
    about: "説明者・相手・説明した内容・文書・質問と答え・理解と同意",
    roles: ["医師", "看護師"],
    sources: [RECORD_SOURCES.kisoku, { label: `${RECORD_SOURCES.ryuui.label} 第1章第2部 入院料等 通則（入院診療計画）`, url: RECORD_SOURCES.ryuui.url }],
    body: [
      "説明日：{{日付}}（{{入院日数}}）　説明者：{{文:説明者}}",
      "説明の相手：{{複数:相手:本人|家族|代理人}}　{{文:相手の名前・続柄}}",
      "説明した内容：{{複数:内容:病名と主要な症状|検査・手術・治療の計画|推定される入院期間|看護計画|リハビリの計画|栄養管理|退院に向けた支援|その他}}",
      "文書：{{選択:文書:入院診療計画書を渡した|後日に渡す}}",
      "質問と答え：{{文:質問と答え}}",
      "理解と同意：{{選択:理解と同意:理解され同意を得た|質問が残っており再度説明する}}",
    ].join("\n"),
    prefill: (f) => ({ "文:説明者": f.me.name }),
  },
  {
    id: "rec-discharge",
    name: "退院時の説明",
    short: "退院説明",
    about: "退院日・退院先・説明した内容・渡した文書・質問と答え",
    roles: ["医師", "看護師"],
    body: [
      "退院日：{{文:退院日}}　退院先：{{選択:退院先:自宅|施設|転院}}",
      "説明者：{{文:説明者}}　相手：{{複数:相手:本人|家族|施設職員|ケアマネジャー}}",
      "説明した内容：{{複数:内容:退院後の療養の注意|内服薬（退院処方）|食事|活動・リハビリ|創の管理|受診の予定|緊急時の連絡先|介護サービス}}",
      "文書：{{複数:文書:退院療養計画書|退院処方の説明書|診療情報提供書|お薬手帳|なし}}",
      "質問と答え：{{文:質問と答え}}",
    ].join("\n"),
    prefill: (f) => ({ "文:説明者": f.me.name }),
  },
  {
    id: "rec-ic",
    name: "ICの記録",
    short: "IC",
    about: "説明者・同席者・説明の内容・質問と答え・結果（同意）",
    roles: ["医師", "看護師"],
    sources: [RECORD_SOURCES.iryoho],
    required: ["病名・病状", "提案する治療・検査"],
    body: [
      "日時：{{日付}} {{時刻:時刻}}　説明者：{{文:説明者}}　同席者：{{文:同席者}}",
      "説明の相手：{{複数:相手:本人|家族|代理人}}　{{文:相手の名前・続柄}}",
      "病名・病状：{{文:病名・病状}}",
      "提案する治療・検査：{{文:提案する治療・検査}}",
      "ほかの選択肢：{{文:ほかの選択肢}}",
      "期待される利益：{{文:期待される利益}}",
      "起こりうる合併症・危険と頻度：{{文:起こりうる合併症・危険と頻度}}",
      "行わない場合に予想されること：{{文:行わない場合に予想されること}}",
      "費用・期間など：{{文:費用・期間など}}",
      "説明の内容（補足）：{{文:説明の内容}}",
      "理解の確認：{{選択:理解の確認:説明を自分の言葉で言い直せた|質問があった|理解が難しく再説明が必要}}",
      "本人の意思決定の支援：{{複数:本人の意思決定の支援:本人|家族|代理人|通訳|医療チーム}}",
      "同意の撤回ができること：{{選択:同意の撤回:伝えた|伝えていない}}",
      "用いた資料：{{複数:資料:説明文書|同意書|画像|検査結果|なし}}",
      "質問と答え：{{文:質問と答え}}",
      "結果：{{選択:結果:同意を得た|同意しなかった|考える時間を希望|後日あらためて説明}}",
      "同意書：{{選択:同意書:取得した（同意書に記録）|不要|後日}}",
    ].join("\n"),
    prefill: (f) => ({ "文:説明者": f.me.name, "時刻:時刻": f.nowTime }),
  },
  {
    id: "rec-fall",
    name: "転倒・転落時の記録",
    short: "転倒",
    about: "発見の時刻と場所・状況・意識と外傷・バイタル・医師への報告・家族への連絡・対策",
    roles: ["看護師", "医師"],
    sources: [FALL_SOURCES.teigen],
    rule: "記録の項目はこの病院の取り決めです。転倒のあとはリスクを再評価します。",
    required: ["状況の詳細"],
    body: [
      "発見：{{時刻:発見時刻}}　場所：{{選択:場所:病室（ベッド周り）|トイレ|廊下|浴室|検査室・その他}}",
      "状況：{{選択:状況:ベッドからの転落|歩行中の転倒|移乗時の転倒|トイレでの転倒|座り込み|不明（発見時には床にいた）}}　{{文:状況の詳細}}",
      "目撃：{{選択:目撃:あり|なし}}",
      "意識：{{選択:意識:いつもと同じ|いつもと違う}}　外傷：{{複数:外傷:なし|擦過傷|打撲・腫脹|裂創・出血|疼痛|頭部の打撲}}",
      "バイタル：{{バイタル}}　{{文:測定したバイタル}}",
      "医師への報告：{{選択:医師への報告:報告した|報告する|不要と判断}}　{{文:報告の時刻と相手}}",
      "医師の指示：{{文:医師の指示}}",
      "家族への連絡：{{選択:家族への連絡:連絡した|連絡する|不要と判断}}　{{文:家族への連絡の内容}}",
      "今後の対策：{{複数:対策:転倒・転落のアセスメントを再評価|離床センサー|ベッドの高さ・柵の見直し|ナースコールの再指導|排泄の誘導|薬剤の見直しを依頼}}",
      "インシデント報告：{{選択:インシデント報告:作成する|作成した}}",
    ].join("\n"),
    prefill: (f) => ({ "文:報告の時刻と相手": f.patient.attending }),
  },
  {
    id: "rec-delirium",
    name: "せん妄の評価",
    short: "せん妄",
    about: "リスク因子・いまの状態・変動・考えられる要因・対策・医師への報告",
    roles: ["看護師", "医師"],
    sources: [{ label: `${RECORD_SOURCES.ryuui.label} A247-2 せん妄ハイリスク患者ケア加算（別紙様式7の3 リスク因子と対策）`, url: RECORD_SOURCES.ryuui.url }],
    rule: "リスク因子と対策は別紙様式7の3の項目。「いまの状態」の観察の項目はこの病院の取り決めです。",
    body: [
      `リスク因子：{{複数:リスク因子:${DELIRIUM_RISKS.join("|")}|なし}}`,
      "いまの状態：{{複数:状態:注意の障害（会話に集中できない）|見当識の障害（場所・時間が分からない）|睡眠と覚醒のリズムの乱れ|幻覚・妄想|興奮・不穏|活動の低下（ぼんやりしている）|いつもと変わらない}}",
      "変動：{{選択:変動:日内で変動あり|一日を通して同じ}}",
      "考えられる要因：{{複数:要因:薬剤|脱水|感染|疼痛|便秘・尿閉|低酸素|電解質の異常|環境の変化|不明}}",
      `対策：{{複数:対策:${DELIRIUM_MEASURES.join("|")}}}`,
      "医師への報告：{{選択:医師への報告:報告した|報告する|不要と判断}}　{{文:補足}}",
    ].join("\n"),
    prefill: (f): TemplateValues => (f.patient.age >= 70 ? { "複数:リスク因子": ["70歳以上"] } : {}),
  },
  {
    id: "rec-emergency",
    name: "急変時の記録",
    short: "急変",
    about: "発見の時刻・状況・意識/呼吸/脈・バイタル・行った処置・医師と家族への連絡・転帰",
    roles: ["看護師", "医師"],
    rule: "記録の項目はこの病院の取り決めです。",
    required: ["状況"],
    body: [
      "発見：{{時刻:発見時刻}}　発見者：{{文:発見者}}",
      "状況：{{文:状況}}",
      "意識：{{選択:意識:清明|呼びかけに反応|痛み刺激に反応|反応なし}}　呼吸：{{選択:呼吸:あり|弱い|なし}}　脈：{{選択:脈:触れる|弱い|触れない}}",
      "バイタル：{{文:バイタル}}",
      "行った処置：{{複数:処置:応援を呼んだ|酸素投与|吸引|気道確保|胸骨圧迫|除細動|静脈路の確保|薬剤の投与|モニター装着|体位の調整}}　{{文:処置の詳細}}",
      "医師への連絡：{{時刻:医師への連絡}}　{{文:連絡した医師と指示}}",
      "家族への連絡：{{選択:家族への連絡:連絡した|連絡する|連絡しない（事前の希望）}}　{{文:家族への連絡の内容}}",
      "事前指示（DNAR など）：{{選択:事前指示:確認した|なし}}",
      "転帰：{{選択:転帰:状態が安定|ICU・HCUへ移動|処置を継続中|死亡}}",
    ].join("\n"),
    prefill: (f) => ({ "文:発見者": f.me.name, "文:連絡した医師と指示": f.patient.attending }),
  },
  {
    id: "rec-death",
    name: "死亡時の記録",
    short: "死亡",
    about: "死亡確認の時刻・所見・立会い・経過・死因・家族への説明・死亡診断書",
    roles: ["医師"],
    sources: [RECORD_SOURCES.death],
    required: ["確認した医師", "直接の死因"],
    body: [
      "死亡確認：{{日付}} {{時刻:死亡確認の時刻}}　確認した医師：{{文:確認した医師}}",
      "確認した所見：{{複数:所見:呼吸の停止|心拍の停止|瞳孔の散大・対光反射の消失}}",
      "立会い：{{文:立会い}}",
      "経過の要点：{{文:経過の要点}}",
      "直接の死因：{{文:直接の死因}}　原因となった傷病：{{文:原因となった傷病}}",
      "家族への説明：{{選択:家族への説明:説明した|電話で説明した|来院後に説明する}}　{{文:説明の内容}}",
      "死亡診断書：{{選択:死亡診断書:作成した|作成する}}　病理解剖：{{選択:病理解剖:希望なし|希望あり|説明していない}}",
    ].join("\n"),
    prefill: (f) => ({ "文:確認した医師": doctorName(f) }),
  },
  {
    id: "rec-ulcer",
    name: "褥瘡の記録",
    short: "褥瘡",
    about: "部位・DESIGN-R®2020（最新の評価から）・創の状態・処置・除圧・栄養・次の評価",
    roles: ["看護師", "医師"],
    link: { panel: "pressure", label: "褥瘡の経過（DESIGN-R®2020 の評価・写真）を開く" },
    sources: [PRESSURE_SOURCES.scale, PRESSURE_SOURCES.form],
    rule: "DESIGN-R®2020 の採点は「褥瘡の経過」で行い、この記事はその日の処置とケアを残します（二重に採点しません）。",
    body: [
      `部位：{{選択:部位:${SITES.join("|")}}}　{{文:部位の補足}}`,
      "DESIGN-R®2020：{{文:DESIGN-R}}",
      "大きさ：{{文:大きさ}}",
      "創の状態：{{複数:創の状態:壊死組織あり|肉芽が良好|滲出液が多い|感染の徴候（発赤・熱感・膿）|臭気|ポケットあり|痛みあり|改善している}}",
      "処置：{{文:処置}}",
      "除圧：{{複数:除圧:体圧分散マットレス|2時間ごとの体位変換|座位の時間を制限|クッションの使用}}",
      "栄養：{{選択:栄養:栄養の評価を依頼|栄養の介入中|問題なし}}",
      "次の評価：{{選択:次の評価:1週間後|状態が変わったとき}}",
    ].join("\n"),
    prefill: (f) => {
      const u = f.ulcers?.[0];
      const a = u ? latestOf(u) : undefined;
      if (!u) return {};
      return {
        "選択:部位": (SITES as readonly string[]).includes(u.site) ? u.site : "",
        ...(u.siteNote ? { "文:部位の補足": u.siteNote } : {}),
        ...(a ? { "文:DESIGN-R": `${designText(a.score)}（合計 ${designTotal(a.score)}点、${a.at.time} の評価）` } : {}),
      };
    },
  },
  {
    id: "rec-transfusion",
    name: "輸血の同意と実施の記録",
    short: "輸血",
    about: "製剤・同意・実施前の確認・開始と終了・観察（5分・15分・終了後）・副反応・実施者",
    roles: ["医師", "看護師"],
    sources: [BLOOD_SOURCES.guide, BLOOD_SOURCES.rule],
    body: [
      "製剤：{{選択:製剤:赤血球液|新鮮凍結血漿|濃厚血小板|その他}}　{{文:製剤の補足（単位・製造番号）}}",
      "同意：{{選択:同意:同意書を取得した|同意書は別に記録|緊急で口頭の同意}}　説明者：{{文:説明者}}",
      "実施前の確認：{{複数:確認:患者の照合（2人で）|製剤と伝票の照合|血液型の確認|交差適合試験の結果|製剤の外観}}",
      "開始：{{時刻:開始時刻}}　終了：{{文:終了時刻}}",
      "観察：開始5分 {{選択:開始5分:異常なし|副反応あり}}、15分 {{選択:15分:異常なし|副反応あり}}、終了後 {{選択:終了後:異常なし|副反応あり}}",
      "副反応：{{文:副反応の内容と対応}}",
      "実施者：{{文:実施者}}",
    ].join("\n"),
    prefill: (f) => ({ "文:実施者": f.me.name }),
  },
  {
    id: "rec-verbal",
    name: "口頭指示の記録",
    short: "口頭指示",
    about: "日時・指示医・受けた者・状況・指示の内容・復唱の確認・医師の記載",
    roles: ["看護師", "医師"],
    rule: "口頭指示は復唱して確かめ、医師が後からオーダに残します。",
    required: ["指示の内容"],
    body: [
      "日時：{{日付}} {{時刻:時刻}}　指示医：{{文:指示医}}　受けた者：{{文:受けた者}}",
      "状況（口頭指示が必要だった理由）：{{選択:状況:緊急|医師が離れた場所にいた|電話}}",
      "指示の内容（薬剤名・量・経路・回数・時刻）：{{文:指示の内容}}",
      "確認：{{複数:確認:指示を復唱した|医師が復唱を確認した|口頭指示の用紙に記録}}",
      "医師の記載：{{選択:医師の記載:後でオーダに残す|オーダに入れた}}",
    ].join("\n"),
    prefill: (f) => ({ "時刻:時刻": f.nowTime, "文:指示医": f.patient.attending, "文:受けた者": f.me.name }),
  },
];

/** The templates offered to a role: the hospital's, then the person's own (shared with 記事のテンプレート). */
export const recordTemplatesFor = (role: Role, mine: NoteTemplate[]): { builtIn: RecordTemplate[]; mine: NoteTemplate[] } => ({
  builtIn: BUILTIN_RECORD_TEMPLATES.filter((t) => t.roles.includes(role)),
  mine,
});

export const findRecordTemplate = (id: string, mine: NoteTemplate[]): RecordTemplate | NoteTemplate | undefined => BUILTIN_RECORD_TEMPLATES.find((t) => t.id === id) ?? mine.find((t) => t.id === id);

const isRecord = (t: NoteTemplate): t is RecordTemplate => "short" in t;

/** The short name on a rail tile: the template's own, or the first characters of its name. */
export const shortNameOf = (t: NoteTemplate): string => (isRecord(t) ? t.short : t.name.length > 6 ? `${t.name.slice(0, 6)}…` : t.name);

/** The first line of the note: 【テンプレート名】. */
export const recordHeading = (t: NoteTemplate) => `【${t.name}】`;

/** The form's starting values: numbers the chart has (身長・体重) and what the template reads from the chart. */
export function startRecordValues(t: NoteTemplate, facts: RecordFacts): TemplateValues {
  const base = startValues(parseTemplate(t.body), facts);
  return { ...base, ...(isRecord(t) && t.prefill ? t.prefill(facts) : {}) };
}

/** The note: the heading, then the template with every field filled in (blank 文 lines stay as their label). */
export function buildRecord(t: NoteTemplate, values: TemplateValues, facts: RecordFacts): string {
  const total = t.id === "rec-icu-admit" ? `\nSOFA 合計：${sofaTotal(values) === null ? "未計算（6項目を選んでください）" : `${sofaTotal(values)}点`}` : "";
  return `${recordHeading(t)}\n${fillTemplate(parseTemplate(t.body), values, facts)}${total}${t.id === "rec-vte" ? `\n${paduaText(values)}` : ""}`.replace(/\s+$/, "");
}

/** Why the record cannot be confirmed yet: choices, numbers and times not entered, and required 文 left empty. */
export function recordProblems(t: NoteTemplate, values: TemplateValues): string[] {
  const parsed = parseTemplate(t.body);
  const out = unanswered(parsed, values).map((l) => `「${l}」がまだです`);
  if (isRecord(t))
    for (const label of t.required ?? []) {
      const f = parsed.fields.find((x) => x.kind === "文" && x.label === label);
      if (!f) continue;
      const v = values[fieldKey(f)];
      if (typeof v !== "string" || !v.trim()) out.push(`「${label}」を書いてください`);
    }
  return out;
}
