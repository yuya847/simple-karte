// The radiology 指示受け (band, blocks, the three pairs), the 指示確認 panel, the worklist, the portable round, the
// technologist's home and tools render on the server (without a browser).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { homeArea } from "@/lib/nav";
import { PATIENTS } from "@/lib/patients";
import { demoRisOrders, initialRisDesk, putWork, risRows } from "@/lib/ris";
import { risConfirmItems } from "@/lib/ris-take";
import { STAFF, TABS, type Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import { PortableRound, RadiologyTake, RisConfirmPanel, Worklist } from "./RadiologyTake";
import { RadiologyView } from "./RadiologyView";
import { MeProvider, RoleProvider } from "./RoleContext";
import { groupsFor, ToolRail } from "./ToolRail";

const today = { y: 2026, m: 11, d: 4 };
const NOW = 600;
const orders = demoRisOrders(NOW);
const people = PATIENTS.map((p) => ({ patient: p, room: p.room, entries: (orders[p.id] ?? []) as OrderEntry[] }));
const desk = initialRisDesk(NOW);
const noop = () => {};
const as = (role: Role, node: React.ReactNode) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{node}</MeProvider>
    </RoleProvider>,
  );

describe("放射線部の指示受けの画面", () => {
  it("is the first tab of 放射線部, where the technologist starts", () => {
    expect(TABS.診療放射線技師[0]).toBe("ris");
    expect(homeArea("診療放射線技師")).toBe("radiology");
    const html = as("診療放射線技師", <RadiologyView people={people} desk={desk} onDesk={noop} acks={{}} nowTime="10:00" today={today} />);
    expect(html).toContain('aria-selected="true"');
    expect(html.indexOf("指示受け")).toBeLessThan(html.indexOf("当日の予定"));
    expect(html).toContain("未指示受け 3件");
  });

  it("shows the untaken orders in the catalog's form: the band at the top, a band per patient with its marks, each order with ○, heading, three pairs and 項目名：値", () => {
    const html = as("診療放射線技師", <RadiologyTake people={people} rows={risRows(people, desk)} onDesk={noop} nowTime="10:00" today={today} />);
    // The band at the top.
    expect(html).toContain("今日 11/4（水）");
    expect(html).toContain("指示受け済みも表示する");
    for (const k of ["X線", "CT", "MRI", "エコー", "ポータブル"]) expect(html).toContain(`accent-ai" checked=""/>${k}`);
    expect(html).toContain("至急だけ");
    expect(html).toContain("全チェック");
    expect(html).toContain("一括受け");
    expect(html).toContain("未指示受け 3件");
    expect(html).toContain("遅れ 1件"); // the 至急 X線 ordered 20 minutes ago
    // The band of a patient, with the marks.
    expect(html).toContain("患者ID ");
    expect(html).toContain("森 久美子");
    expect(html).toContain("部屋 </span>511");
    expect(html).toContain("感染症：MRSA（血液）");
    expect(html).toContain("アレルギー：ヨード造影剤（蕁麻疹）");
    expect(html).toContain("体内金属（MRI）なし（確認済み）");
    // The blocks.
    expect(html).toContain("画像検査　CT　腹部・骨盤　単純＋造影");
    expect(html).toContain("指示日時");
    expect(html).toContain("指示医");
    expect(html).toContain("予定日時");
    expect(html).toContain("撮影室・装置");
    expect(html).toContain("指示受け日時");
    expect(html).toContain("受けた技師");
    expect(html).toContain("山本（専攻医）");
    expect(html).toContain("部位</dt><dd class=\"nums\">腹部・骨盤");
    expect(html).toContain("造影</dt><dd class=\"nums\">単純＋造影");
    expect(html).toContain("依頼目的</dt><dd class=\"nums\">");
    expect(html).toContain("同意</dt><dd class=\"nums\">同意書の記録なし");
    expect(html).toContain("体位・方向</dt><dd class=\"nums\">立位正面（PA）");
    // 至急・造影・MRI one at a time; nothing here can be ticked in bulk.
    expect(html).toContain("開いて受ける");
    expect(html).toContain('title="1件ずつ受けます：至急"');
    expect(html).toContain("1件ずつ受けます：造影（同意・腎機能・アレルギーを確かめる）");
    expect(html).toContain("1件ずつ受けます：MRI（体内金属の確認）");
    expect(html).not.toContain(">指示を受ける<");
    expect(html).toContain("denshi_gx.pdf");
    expect(html).toContain("架空の病院の取り決め");
  });

  it("a taken contrast CT keeps its row with the room/time controls and 「確認する（まだ）」; a nurse sees the lock", () => {
    const ct = risRows(people, desk).find((r) => r.orderId === "o-ris-demo2")!;
    const d = putWork(desk, ct, (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "放射線技師 松本" } }));
    const html = as("診療放射線技師", <RadiologyTake people={people} rows={risRows(people, d)} onDesk={noop} nowTime="10:05" today={today} />);
    expect(html).toContain("指示受け日時：</span><span class=\"nums\">10:00");
    expect(html).toContain("放射線技師 松本");
    expect(html).toContain("受けたが確認がまだ 1件");
    expect(html).toContain("確認する（まだ）");
    expect(html).toContain('aria-label="撮影室・装置"');
    expect(html).toContain("CT室（SK_CT1）");
    expect(html).toContain('aria-label="撮影の予定時刻"');
    expect(html).toContain("割り当てる");
    expect(html).toContain("撮影できなかった");
    const nurse = as("看護師", <RadiologyTake people={people} rows={risRows(people, d)} onDesk={noop} nowTime="10:05" today={today} />);
    expect(nurse).toContain("撮影の受付・実施・照射録・線量と造影剤の記録は診療放射線技師が行います");
  });

  it("the 指示確認 panel of a contrast CT lists 同意・腎機能・アレルギー・メトホルミン and the confirm button", () => {
    const ct = risRows(people, desk).find((r) => r.orderId === "o-ris-demo2")!;
    const mori = PATIENTS.find((p) => p.id === ct.patientId)!;
    const html = as("診療放射線技師", <RisConfirmPanel r={ct} items={risConfirmItems(ct, mori, orders[mori.id], undefined, today)} onConfirm={noop} onClose={noop} />);
    expect(html).toContain("指示確認：CT　腹部・骨盤　単純＋造影");
    expect(html).toContain("同意</dt>");
    expect(html).toContain("腎機能</dt>");
    expect(html).toContain("eGFR");
    expect(html).toContain("ヨードのアレルギー</dt>");
    expect(html).toContain("メトホルミン（ビグアナイド系）</dt>");
    expect(html).toContain("確認した");
    expect(html).toContain("指示受け → 指示確認 → 撮影");
  });

  it("the worklist lays the taken studies on the rooms' lanes with the next step, and marks the late one", () => {
    const rows = risRows(people, desk);
    const ct = rows.find((r) => r.orderId === "o-ris-demo2")!;
    const d = putWork(desk, ct, (w) => ({ ...w, arrived: { day: 0, time: "10:00", by: "技師" }, room: "CT1", slot: { day: 0, time: "15:00" } }));
    const html = as("診療放射線技師", <Worklist rows={risRows(people, d)} onDesk={noop} nowTime="15:20" today={today} />);
    expect(html).toContain("一般撮影室1");
    expect(html).toContain("CT室");
    expect(html).toContain("MRI室");
    expect(html).toContain("病棟（回診用）");
    expect(html).toContain("森 久美子");
    expect(html).toContain(">呼出<");
    expect(html).toContain("確認がまだ");
    expect(html).toContain("遅れ（予定から20分）");
    expect(html).toContain("呼出：病棟へ搬送依頼を記録します"); // a ward patient is brought by the ward
    expect(html).toContain("北村 博");
    expect(html).toContain(">済<");
  });

  it("the portable round lists the taken portables by room", () => {
    const html = as("診療放射線技師", <PortableRound rows={risRows(people, desk)} onDesk={noop} nowTime="10:00" />);
    expect(html).toContain("病棟のポータブル回り");
    expect(html).toContain("回るポータブルの指示はありません"); // 北村さんの is done
  });

  it("in a ward patient's chart the technologist gets only 放射線画像・レポート一覧・患者モニター", () => {
    expect(groupsFor("診療放射線技師").flatMap((g) => [...g.main, ...g.more].map((t) => t.key))).toEqual(["imaging", "report-list", "monitor"]);
    expect(groupsFor("医師").length).toBe(5);
    const html = as("診療放射線技師", <ToolRail open={null} onOpen={noop} calendars={[{ key: "flow", label: "経過表", icon: (() => null) as never, on: false, open: noop }]} />);
    expect(html).toContain("放射線画像");
    expect(html).toContain("レポート一覧");
    expect(html).toContain("患者モニター");
    expect(html).not.toContain("画像検査");
    expect(html).not.toContain("バイタル");
    expect(html).not.toContain("経過表");
  });
});
