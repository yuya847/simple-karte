// 院内マニュアル of the fictional hospital. Each manual is a short list of steps written as an
// example for this fictional hospital (架空の病院の手順（例）), kept in line with the public sources it
// names. The steps say who does what and in what order; they give no doses and decide nothing
// clinical (the doctor does). Searching and grouping are code. Nothing here is written by AI.

import { kanaMatch } from "./kana";
import type { CalendarDate } from "./dates";

export type Chapter = "医療安全" | "感染対策" | "急変時の対応" | "輸血" | "身体的拘束の最小化" | "褥瘡対策" | "災害時" | "システム障害時";

export const CHAPTERS: Chapter[] = ["医療安全", "感染対策", "急変時の対応", "輸血", "身体的拘束の最小化", "褥瘡対策", "災害時", "システム障害時"];

export interface ManualSource {
  title: string;
  issuer: string;
  year: string;
  url: string;
  /** Which part of the source the steps follow. */
  part?: string;
}

export interface Manual {
  id: string;
  chapter: Chapter;
  title: string;
  /** The department that keeps the manual (fictional). */
  dept: string;
  /** 版 (fictional). */
  version: string;
  /** 改訂日 (fictional). */
  revised: CalendarDate;
  steps: string[];
  /** A line shown under the steps (what the manual does not cover, etc.). */
  note?: string;
  sources: ManualSource[];
}

export const MANUAL_LABEL = "院内の手順（例）";

const S = {
  medSafe195: {
    title: "医療安全情報 No.195「照合の未実施による誤った患者への検査・処置」",
    issuer: "公益財団法人 日本医療機能評価機構（医療事故情報収集等事業）",
    year: "2023年2月",
    url: "https://www.med-safe.jp/pdf/med-safe_195.pdf",
  },
  // The Ministry's 「輸血療法の実施に関する指針」 was abolished on 2026-03-24 (txNotice); the guide reorganises it.
  txGuide: {
    title: "輸血療法実践ガイド",
    issuer: "一般社団法人 日本輸血・細胞治療学会 ガイドライン委員会",
    year: "2026年2月（令和8年2月）",
    url: "https://yuketsu.jstmct.or.jp/wp-content/uploads/2026/02/c94fb40adf823eac4fe9feb13f6d6c60.pdf",
  },
  txNotice: {
    title: "「血液製剤の使用指針」、「輸血療法の実施に関する指針」及び「血液製剤保管管理マニュアル」の廃止並びに「輸血療法実践ガイド」の周知について（医薬発0324第2号）",
    issuer: "厚生労働省 医薬局長",
    year: "2026年3月24日（令和8年3月24日）",
    url: "https://www.mhlw.go.jp/content/11120000/001680857.pdf",
  },
  fall: {
    title: "医療事故の再発防止に向けた提言 第9号「入院中に発生した転倒・転落による頭部外傷に係る死亡事例の分析」",
    issuer: "医療事故調査・支援センター（一般社団法人 日本医療安全調査機構）",
    year: "2019年6月（2020年2月一部修正）",
    url: "https://www.medsafe.or.jp/teigen/teigen-09.pdf",
  },
  cdcIsolation: {
    title: "2007 Guideline for Isolation Precautions: Preventing Transmission of Infectious Agents in Healthcare Settings",
    issuer: "CDC（Centers for Disease Control and Prevention：米国疾病予防管理センター）・HICPAC（Healthcare Infection Control Practices Advisory Committee）",
    year: "2007年（2024年9月更新）",
    url: "https://www.cdc.gov/infection-control/hcp/isolation-precautions/index.html",
  },
  whoHand: {
    title: "WHO Guidelines on Hand Hygiene in Health Care",
    issuer: "WHO（World Health Organization：世界保健機関）",
    year: "2009年",
    url: "https://www.who.int/publications/i/item/9789241597906",
  },
  bls: {
    title: "「救急蘇生法の指針2025（市民用）」への対応について（消防救第385号）別紙「主に市民が行う一次救命処置」",
    issuer: "消防庁 救急企画室",
    year: "2026年10月23日",
    url: "https://www.fdma.go.jp/laws/tutatsu/items/20261023_kyuuki_01.pdf",
  },
  jrc: {
    title: "JRC蘇生ガイドライン2025",
    issuer: "一般社団法人 日本蘇生協議会（JRC：Japan Resuscitation Council）",
    year: "2025年版",
    url: "https://www.jrc-cpr.org/",
  },
  restraintR6: {
    title: "令和6年度診療報酬改定「身体的拘束を最小化する取組の強化（入院料通則の改定③）」身体的拘束最小化の基準",
    issuer: "厚生労働省（中央社会保険医療協議会の資料）",
    year: "2024年",
    url: "https://www.mhlw.go.jp/content/10808000/001270593.pdf",
  },
  restraintGuide: {
    title: "介護施設・事業所等で働く方々への身体拘束廃止・防止の手引き",
    issuer: "厚生労働省（令和5年度老人保健健康増進等事業）",
    year: "2024年3月",
    url: "https://www.mhlw.go.jp/content/12300000/001248430.pdf",
  },
  pressureR6: {
    title: "基本診療料の施設基準等及びその届出に関する手続きの取扱いについて（保医発0305第5号）",
    issuer: "厚生労働省 保険局 医療課",
    year: "2024年3月5日",
    url: "https://www.mhlw.go.jp/content/12404000/001293317.pdf",
  },
  bcp: {
    title: "病院におけるＢＣＰ（業務継続計画）の考え方に基づいた災害対策マニュアルについて（医政指発0904第2号）別添「ＢＣＰの考え方に基づいた病院災害対応計画作成の手引き」",
    issuer: "厚生労働省 医政局 指導課",
    year: "2013年9月4日",
    url: "https://www.mhlw.go.jp/file/06-Seisakujouhou-10800000-Iseikyoku/0000089048.pdf",
  },
  gl7ops: {
    title: "医療情報システムの安全管理に関するガイドライン 第7.0版 システム運用編",
    issuer: "厚生労働省",
    year: "2026年6月",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
  gl7plan: {
    title: "医療情報システムの安全管理に関するガイドライン 第7.0版 企画管理編",
    issuer: "厚生労働省",
    year: "2026年5月",
    url: "https://www.mhlw.go.jp/content/10808000/001716292.pdf",
  },
  bcpTemplate: {
    title: "医療情報システム部門等におけるBCPのひな形",
    issuer: "厚生労働省",
    year: "2024年6月",
    url: "https://www.mhlw.go.jp/content/10808000/001261302.pdf",
  },
  bcpCheck: {
    title: "サイバー攻撃を想定した事業継続計画（BCP）策定の確認表",
    issuer: "厚生労働省",
    year: "2024年6月",
    url: "https://www.mhlw.go.jp/content/10808000/001261299.pdf",
  },
} satisfies Record<string, ManualSource>;

/** The manuals of the fictional hospital. 版 and 改訂日 are fictional. */
export const MANUALS: Manual[] = [
  {
    id: "m-identify",
    chapter: "医療安全",
    title: "患者確認（照合）",
    dept: "医療安全管理室",
    version: "第4版",
    revised: { y: 2026, m: 4, d: 1 },
    steps: [
      "患者に、自分でフルネームと生年月日を言ってもらいます。こちらが名前を呼んで返事をもらうだけでは、確認になりません。",
      "言ってもらった氏名と生年月日を、手元の情報（リストバンド・電子カルテの画面・指示書・ラベル）と照合します。言ってもらっても、照合しなければ確認したことになりません。",
      "名乗れない患者（意識がはっきりしない・鎮静中・小さな子どもなど）は、リストバンドと手元の情報を照合し、できるだけ2人で確かめます（輸血ではいつも2人で確かめる）。",
      "部屋番号やベッドの位置は、患者確認には使いません。",
      "同姓同名や似た名前の患者がいるときは、患者番号（ID）と生年月日でも見分けます。病棟の名札とカルテに注意の印をつけます。",
      "リストバンドと薬・検体のラベルをバーコードで照合できるときは使います。合わないと出たら、その場で止めて確かめ直します。",
    ],
    sources: [
      { ...S.medSafe195, part: "患者に氏名と生年月日など2つの情報を言ってもらい、医療者側の情報と照合する（事例が発生した医療機関の取り組み）" },
      { ...S.txGuide, part: "Ⅱ-3-3)a ⅲ)・ⅳ)（輸血の受け渡しと実施のときに患者氏名・血液型・製造番号などを2人で声に出して確認、患者照合には ID 番号や生年月日も併せて確認、リストバンドと製剤の電子機器での照合も有効）、Ⅰ-3-2)（検体の採血では患者からの氏名申告とリストバンド照合が重要）" },
    ],
  },
  {
    id: "m-fall",
    chapter: "医療安全",
    title: "転倒・転落の予防と起きたときの対応",
    dept: "医療安全管理室・看護部",
    version: "第3版",
    revised: { y: 2025, m: 10, d: 1 },
    steps: [
      "入院のときに転倒・転落の危険を評価します。転棟したときと、治療で状態が変わったときは評価し直します。評価と対策は多職種と夜勤に伝え、透析など病棟の外で治療を受けるときも伝えます。",
      "転倒・転落の経験、認知機能の低下・せん妄、向精神薬の内服、頻尿・夜間の排泄の行動は、大事な危険の要因です。",
      "ベッド柵を乗り越えるおそれがある患者には、低いベッドや衝撃を和らげるマットを考えます。転倒・転落の危険が高い患者の保護帽は、患者・家族の同意を得て考えます。",
      "転倒・転落を見つけたら、患者のそばを離れずに人を呼びます。意識・痛み・出血を確かめてから動かします。",
      "頭を打ったとき（打ったかもしれないときも）は、見た目に異常がなくても医師に報告します。提言は、明らかな異常がなくても頭部CTを推奨しています。撮るかどうかは医師が決めます。",
      "頭を打ったときは、抗凝固薬・抗血小板薬を飲んでいるかを確かめ、医師に伝えます。",
      "意識レベル・麻痺・瞳孔・バイタルサインを、時間を追って何度も観察し、記録します。",
      "インシデントレポートを書きます（メニューの「インシデントレポート」）。",
    ],
    sources: [{ ...S.fall, part: "提言1・2（頭部打撲のときの対応と観察）、提言4（衝撃を和らげる方法）、提言5（危険の要因）、提言7（情報の共有と再評価）" }],
  },
  {
    id: "m-standard",
    chapter: "感染対策",
    title: "標準予防策と手指衛生",
    dept: "感染対策室",
    version: "第5版",
    revised: { y: 2026, m: 4, d: 1 },
    steps: [
      "標準予防策は、感染症があるかどうかにかかわらず、すべての患者に行います。",
      "手指衛生は5つのタイミングで行います：患者に触れる前、清潔・無菌の操作の前、体液に触れたおそれのある後、患者に触れた後、患者の周りの物に触れた後。手袋を外した後にも行います。",
      "手が目に見えて汚れているとき・血液や体液で汚れたときは、石けんと流水で洗います。それ以外は、アルコールの手指消毒薬を使います。",
      "血液・体液・粘膜・傷のある皮膚に触れるおそれがあるときは、手袋を着けます。服や肌が汚れるおそれがあるときは、ガウンを着けます。",
      "吸引など、しぶきが飛ぶおそれがあるときは、マスクとゴーグル（またはフェイスシールド）を着けます。",
      "個人防護具は、病室を出る前に外して捨てます。外すときに服や肌を汚さないようにします。",
      "使った針は、リキャップ（キャップを戻すこと）をしないで、そのまま貫通しにくい容器（針捨て容器）に捨てます。",
      "咳やくしゃみのある人には、ティッシュで口と鼻を覆ってもらい、できればマスクを着けてもらいます（咳エチケット）。",
    ],
    sources: [
      { ...S.cdcIsolation, part: "Part IV（Standard Precautions：手指衛生・個人防護具・咳エチケット・針の扱い）" },
      { ...S.whoHand, part: "Part I 21.4「My five moments for hand hygiene」" },
    ],
  },
  {
    id: "m-contact",
    chapter: "感染対策",
    title: "接触予防策",
    dept: "感染対策室",
    version: "第3版",
    revised: { y: 2025, m: 12, d: 1 },
    steps: [
      "接触予防策をするかどうかは、医師または感染対策室が決めます。決まったら、病室の入口に表示を出し、手袋とガウンを入口に用意します。",
      "できるだけ個室に入ってもらいます。個室がないときは感染対策室に相談します（同じ菌の患者を同じ部屋にすることもあります）。",
      "病室に入るときに、手袋とガウンを着けます。",
      "病室を出る前に、手袋とガウンを外して捨て、手指衛生をします。",
      "同じ部屋の別の患者に移るときも、防護具を替えて手指衛生をします。",
      "血圧計のマンシェットや聴診器は、その患者専用か使い捨てにします。共用するときは、次の患者に使う前に清拭・消毒します。",
      "病室の外への移動は必要なときだけにします。感染・保菌している部位は覆います。移動の前に防護具を外して手指衛生をし、移動先では新しい防護具を着けます。",
      "クロストリディオイデス・ディフィシルなど芽胞をつくる菌に触れたおそれがあるときは、アルコールではなく石けんと流水で手を洗います。",
    ],
    sources: [{ ...S.cdcIsolation, part: "III.B.1・V.B（Contact Precautions：部屋・手袋とガウン・器具・移動）、IV.A.4（芽胞への手洗い）" }],
  },
  {
    id: "m-arrest",
    chapter: "急変時の対応",
    title: "院内の緊急コール（心停止が疑われるとき）",
    dept: "医療安全管理室・救急外来",
    version: "第2版",
    revised: { y: 2026, m: 11, d: 1 },
    steps: [
      "周りの安全を確かめます。肩をやさしくたたきながら大声で呼びかけ、応答や目的のある仕草がなければ「反応なし」とみなします。",
      "反応がない、または判断に迷うときは、その場で大声で応援を呼び、院内緊急コール（内線 999）と、AED（自動体外式除細動器）・救急カートを頼みます。院内では 119番の代わりに院内緊急コールを使います。",
      "胸と腹部の動きを見て、普段どおりの呼吸かを10秒以内で確かめます。",
      "普段どおりの呼吸がない、または判断に迷うときは、すぐに胸骨圧迫を始めます。テンポは1分間に100〜120回で、中断はできるだけ短くします。",
      "AED が届いたら、すぐに電源を入れ、音声の指示に従います。電気ショックの後は、すぐに胸骨圧迫から再開します。",
      "交代できる人がいれば、1〜2分を目安に胸骨圧迫を交代します。",
      "1人が記録係になり、時刻と行ったことを書き留めます。到着した緊急対応チームに経過を伝えます。",
    ],
    note: "最初の動き方だけを書いています。医療従事者が行う手順（脈の確認・人工呼吸・薬など）は、院内の講習と、日本蘇生協議会（JRC）の JRC蘇生ガイドライン2025 に従います。",
    sources: [
      { ...S.bls, part: "発見時の対応・通報・呼吸の確認・胸骨圧迫・AED・救助者の交代" },
      { ...S.jrc, part: "上の別紙が準拠しているガイドライン" },
    ],
  },
  {
    id: "m-transfusion",
    chapter: "輸血",
    title: "輸血の照合と観察",
    dept: "輸血部（架空）",
    version: "第7版",
    revised: { y: 2026, m: 11, d: 4 },
    steps: [
      "輸血の準備と実施は、1回に1人の患者ごとに行います。何人分もまとめて準備しません。",
      "受け渡しと実施のときに、患者氏名・血液型・製造番号などを照合します。患者は ID 番号と生年月日でも確かめます。有効期限・交差適合試験の結果・放射線照射の有無も見ます。",
      "照合は2人で声に出して確かめ、そのことを記録します。リストバンドと製剤のバーコードを電子機器で照合できるときは使います。",
      "バッグの中の血液の色の変化・溶血・凝集物がないかを、目で確かめます。血小板は、著しい凝集物がないことと、スワーリング（バッグを軽く動かすと見える渦のような模様）を確かめます。",
      "輸血の前に、体温・血圧・脈拍と、できれば SpO2（経皮的動脈血酸素飽和度）を測ります。",
      "1分間に1mLほどの緩やかな速さで始め、開始後5分間はベッドサイドで患者の様子を見ます。15分たったら、もう一度観察します。その後も適宜観察します。",
      "終了後に、患者名・血液型・製造番号をもう一度確かめ、終了時刻と副反応の有無をカルテに記録します。輸血関連急性肺障害・循環過負荷・細菌感染症などは終わってから起こることもあるため、終了後も観察を続けます。",
    ],
    note: "厚生労働省の「輸血療法の実施に関する指針」は令和8年3月24日に廃止されました（医薬発0324第2号）。この版から、日本輸血・細胞治療学会「輸血療法実践ガイド」に合わせています。",
    sources: [
      { ...S.txGuide, part: "Ⅱ-3-3) 輸血の実施体制（a 輸血前 ⅰ)〜ⅳ)、b 輸血中、c 輸血後）" },
      { ...S.txNotice, part: "旧指針の廃止と、他の通知等で旧指針を引用している場合は実践ガイドを参照すること" },
    ],
  },
  {
    id: "m-restraint",
    chapter: "身体的拘束の最小化",
    title: "身体的拘束を最小にするために",
    dept: "身体的拘束最小化チーム（医局・看護部）",
    version: "第2版",
    revised: { y: 2025, m: 6, d: 1 },
    steps: [
      "患者や他の患者などの生命・身体を守るため緊急やむを得ない場合を除き、身体的拘束はしません。",
      "身体的拘束とは、抑制帯など、患者の身体や衣服に触れる用具を使って、一時的に身体を拘束し、動きを抑えることです。",
      "まず、拘束しないで済む方法（原因を取り除く・環境を整える・付き添いや見守り）を、多職種で話し合います。",
      "緊急やむを得ないかは、切迫性・非代替性・一時性の3つをすべて満たすかで判断します。1人では決めず、チームで確かめて記録します。",
      "行うときは、その態様と時間、そのときの患者の心身の状況、緊急やむを得ない理由を記録します。",
      "拘束している間は、勤務帯ごとに続けるかを見直し、やめられるときにすぐやめます。",
      "身体的拘束最小化チームが実施状況をまとめて職員に知らせ、院内の指針を見直します。",
    ],
    note: "精神科病院と精神病室での身体的拘束は、精神保健及び精神障害者福祉に関する法律によります（この手順の対象外）。",
    sources: [
      { ...S.restraintR6, part: "身体的拘束最小化の基準（1）〜（6）" },
      { ...S.restraintGuide, part: "3-1 緊急やむを得ない場合の三つの要件（切迫性・非代替性・一時性）" },
    ],
  },
  {
    id: "m-pressure",
    chapter: "褥瘡対策",
    title: "褥瘡の予防",
    dept: "褥瘡対策チーム",
    version: "第4版",
    revised: { y: 2026, m: 6, d: 1 },
    steps: [
      "日常生活の自立度が低い入院患者は、褥瘡の危険因子を評価します（病棟の「入院時の評価」）。",
      "危険因子がある患者と、すでに褥瘡がある患者は、褥瘡対策チームの専任の医師と看護師が、褥瘡対策の診療計画を作り、行い、評価します（計画に沿って行うのは、病棟の看護師などでもかまいません）。",
      "計画の薬のことと栄養のことは、患者の状態に合わせて書きます。必要なら薬剤師・管理栄養士と一緒に書きます。",
      "患者の状態に合わせて、体圧分散マットレスなどを選んで使います。",
      "体位変換・皮膚の観察・スキンケアのやり方と間隔は計画に書き、行ったことを記録します。",
      "新しい褥瘡を見つけたら、主治医と褥瘡対策チームに伝えます。",
    ],
    sources: [{ ...S.pressureR6, part: "別添2 第1の4 褥瘡対策の基準（2）〜（4）（7）" }],
  },
  {
    id: "m-disaster",
    chapter: "災害時",
    title: "地震のときの病棟の初動",
    dept: "総務課・災害対策委員会",
    version: "第3版",
    revised: { y: 2025, m: 9, d: 1 },
    steps: [
      "まず自分の身を守ります。揺れが収まったら、受け持ちの患者の安全を確かめます。",
      "病棟の被害（けが人・火災・水漏れ・医療ガス・機器や棚の転倒）を確かめ、決まった報告用紙で災害対策本部に報告します。",
      "指示は災害対策本部から出ます。診療を続けるか、外来や手術を止めるか、病院から避難するかは、災害対策本部長が決めます。",
      "人工呼吸器・輸液ポンプ・酸素など、電気や医療ガスが要る患者を確かめ、非常電源のコンセントにつながっているかを見ます。",
      "電子カルテが使えないときは、災害用の紙のカルテに切り替え、使えるようになったら入力します。",
      "院外にいる職員は、連絡が取れないときは、院内の参集基準に従って集まります。",
    ],
    sources: [{ ...S.bcp, part: "3．チェックリストを使った点検の手引き 3）災害対策本部・4）診療継続・避難の判断・6）本部への被害状況の報告・7）ライフライン・9）人員・11）電子カルテ" }],
  },
  {
    id: "m-downtime",
    chapter: "システム障害時",
    title: "電子カルテが止まったとき（システム障害・サイバー攻撃）",
    dept: "医療情報システム部門・医療安全管理室",
    version: "第1版",
    revised: { y: 2026, m: 10, d: 1 },
    steps: [
      "画面が動かない、身代金を求める文やファイルが開けないなど見慣れない表示が出たら、その端末での操作をやめ、医療情報システム部門（内線 2100）へ、場所・端末・日時・何が起きたかを口頭で伝え、あとで報告様式に書きます。",
      "ネットワークの遮断やシステムの停止は、医療情報システム部門（医療情報システム安全管理責任者）の指示に従います。自分の判断で機器をつなぎ直したり、ほかの端末で同じ操作を試したりしません。",
      "システムを止めるか、一部だけで続けるか、紙の運用に切り替えるかは経営層が決め、決まったことは連絡体制図の順に伝わります。",
      "紙の運用に切り替えたら、病棟は「障害時の参照」（前もって印刷したもの、またはこの端末に保存したもの）で、患者ごとのアレルギー・感染症・有効な指示・今日の与薬予定・直近のバイタルと検査を確かめます。作った時刻より後の変更は載っていないので、医師に確かめます。",
      "指示は紙の指示書（複写式）で出し、与薬・処置の実施は紙に記録します。処方と検査の依頼も紙で出します。",
      "非常時用のアカウントを使うときは、使った人と時刻を記録します。復旧したら、そのアカウントは使えないように変え、使われたことを確かめます。",
      "復旧したら、止まっている間に紙に書いたことを、いつ・どこまで入力するかを経営層が決めます。入力するときは、記録時刻（出来事の時刻）を入れて、書いた時刻と分けます。",
      "この手順で年に1回以上訓練し、うまくいかなかったところを手順に入れ直します。",
    ],
    note: "連絡体制図・代替の手段・復旧の手順は、各院の BCP（事業継続計画）で決めます。",
    sources: [
      { ...S.gl7ops, part: "11 遵守事項①(1)〜(4)（非常時用のアカウント、紙での運用等の代替手段）・11.2 非常時における対応・18 遵守事項①（ネットワークの一時切断・隔離）" },
      { ...S.gl7plan, part: "11 非常時（災害、サイバー攻撃、システム障害）対応と BCP 策定 遵守事項①⑥（BCP の策定、定期的な訓練）・表11-1〜11-3" },
      { ...S.bcpTemplate, part: "2.1.5 リスク評価・代替運用（診療録等・処方・検査の紙運用）・3.2 システム異常の検知と経営層への情報伝達・3.3.2 被害拡大防止・3.4.1 縮退運転判断・3.5.1 復旧指示と復旧作業（アナログ情報の反映）" },
      { ...S.bcpCheck, part: "2-1 システム異常の報告先の把握・2-2 システム異常の検知・3-3 被害拡大防止・3-4 経営層の判断" },
    ],
  },
];


export interface ManualHit {
  manual: Manual;
  /** Index of each step that matches (0-based). */
  steps: number[];
  /** The title, chapter or department matches. */
  head: boolean;
}

/** Manuals that match what was typed (hiragana finds katakana), with the steps that match. */
export function searchManuals(manuals: Manual[], typed: string): ManualHit[] {
  if (!typed.trim()) return manuals.map((manual) => ({ manual, steps: [], head: false }));
  const out: ManualHit[] = [];
  for (const m of manuals) {
    const head = [m.title, m.chapter, m.dept].some((w) => kanaMatch(w, typed));
    const steps = m.steps.flatMap((s, i) => (kanaMatch(s, typed) ? [i] : []));
    if (head || steps.length) out.push({ manual: m, steps, head });
  }
  return out;
}

/** The manuals grouped by chapter, in the order of CHAPTERS (empty chapters left out). */
export function byChapter<T extends { manual: Manual }>(hits: T[]): { chapter: Chapter; hits: T[] }[] {
  return CHAPTERS.map((chapter) => ({ chapter, hits: hits.filter((h) => h.manual.chapter === chapter) })).filter((g) => g.hits.length > 0);
}

/** "2026年4月1日" */
export const revisedLabel = (d: CalendarDate): string => `${d.y}年${d.m}月${d.d}日`;
