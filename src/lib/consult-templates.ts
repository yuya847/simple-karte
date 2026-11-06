// 他科依頼・紹介の本文のひな形。依頼状（対診書）に書く項目と順番（主病名・経過・所見と検査・依頼内容）と、
// 要点を S-BAR（状況・背景・評価・依頼）で並べる型に沿う（下の出典）。病院ごとの決まりではなく架空の例で、
// 医師が直してから出す。検査値とバイタルはカルテの直近の値をコードで入れる（lab-paste.ts）。

export const CONSULT_TEMPLATE_SOURCES = [
  { label: "コトラ「他科へのコンサルト依頼文の書き方」", url: "https://www.kotora.jp/c/69694/" },
];

export interface ConsultFacts {
  diagnosis: string;
  labs: string | null;
  vitals: string | null;
  dept: string;
}

export interface ConsultTemplate {
  id: string;
  label: string;
  /** Only for 院外へ紹介 (true), only for 院内 (false), or both (undefined). */
  external?: boolean;
  body: (f: ConsultFacts) => string;
}

const facts = (f: ConsultFacts) => [f.vitals, f.labs].filter(Boolean).join("\n") || "（バイタル・検査結果）";

export const CONSULT_TEMPLATES: ConsultTemplate[] = [
  {
    id: "sbar",
    label: "一般（S-BAR）",
    body: (f) =>
      [
        `${f.dept} 先生`,
        "いつもお世話になっております。お忙しいところ恐れ入りますが、ご高診をお願いいたします。",
        "",
        "【ご相談したいこと】",
        "",
        `【主病名】${f.diagnosis}`,
        "【経過】",
        "",
        "【所見・検査】",
        facts(f),
        "【当科での評価】",
        "",
        "【ご希望】診察・治療方針のご助言（転科・併診のご判断も含めて）",
        "",
        "よろしくお願いいたします。",
      ].join("\n"),
  },
  {
    id: "exam",
    label: "診察のお願い（皮膚・整形など）",
    external: false,
    body: (f) =>
      [
        `${f.dept} 先生`,
        "お忙しいところ恐れ入ります。下記につき、ご診察をお願いいたします。",
        "",
        "【診ていただきたい部位・症状】",
        "【いつから・経過】",
        `【主病名】${f.diagnosis}`,
        "【当科で行ったこと】",
        "【ご希望】診断と処置・治療のご指示",
        "",
        "よろしくお願いいたします。",
      ].join("\n"),
  },
  {
    id: "procedure",
    label: "検査・処置のお願い（内視鏡など）",
    external: false,
    body: (f) =>
      [
        `${f.dept} 先生`,
        "お忙しいところ恐れ入ります。下記の検査（処置）をお願いいたします。",
        "",
        "【お願いしたい検査・処置】",
        "【目的（知りたいこと）】",
        `【主病名】${f.diagnosis}`,
        "【抗血栓薬】あり（薬名・最終内服）／なし",
        "【所見・検査】",
        facts(f),
        "【ご都合のよい日時】",
        "",
        "よろしくお願いいたします。",
      ].join("\n"),
  },
  {
    id: "preop",
    label: "術前評価のお願い",
    external: false,
    body: (f) =>
      [
        `${f.dept} 先生`,
        "お忙しいところ恐れ入ります。下記の手術を予定しており、術前のご評価をお願いいたします。",
        "",
        "【予定の手術・日】",
        "【麻酔】",
        `【主病名・併存症】${f.diagnosis}`,
        "【内服（抗血栓薬など）】",
        "【所見・検査】",
        facts(f),
        "【ご希望】手術の可否とリスク、周術期の内服・管理のご指示",
        "",
        "よろしくお願いいたします。",
      ].join("\n"),
  },
  {
    id: "liaison",
    label: "せん妄・精神症状のご相談",
    external: false,
    body: (f) =>
      [
        `${f.dept} 先生`,
        "お忙しいところ恐れ入ります。下記の精神症状につきご相談させてください。",
        "",
        "【症状（いつから・時間帯・具体的な言動）】",
        "【危険行動】転倒・ルート自己抜去・暴力など あり／なし",
        `【主病名】${f.diagnosis}`,
        "【原因として考えていること】（感染・電解質・薬剤・疼痛・睡眠など）",
        "【使用中の薬（睡眠薬・抗精神病薬など）】",
        "【ご希望】診断と薬物療法・対応のご助言",
        "",
        "よろしくお願いいたします。",
      ].join("\n"),
  },
  {
    id: "referral",
    label: "紹介（診療情報提供）",
    external: true,
    body: (f) =>
      [
        "平素より大変お世話になっております。下記の患者さんをご紹介いたします。",
        "",
        "【紹介の目的】",
        `【傷病名】${f.diagnosis}`,
        "【既往歴・家族歴】",
        "【症状経過・検査結果・治療経過】",
        facts(f),
        "【現在の処方】",
        "【ご本人・ご家族への説明】",
        "",
        "ご高診のほど、よろしくお願い申し上げます。",
      ].join("\n"),
  },
];

export const templatesFor = (external: boolean) => CONSULT_TEMPLATES.filter((t) => t.external === undefined || t.external === external);
