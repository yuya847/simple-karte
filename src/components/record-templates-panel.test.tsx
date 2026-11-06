// テンプレート（型のある記録）の引き出しと右端ツール: the list with ★, a template's form, and pinned templates on
// the rail's お気に入り — rendered on the server, without a browser.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PATIENTS } from "@/lib/patients";
import { pinOfTemplate, saveRail } from "@/lib/rail";
import { INITIAL_RESTRAINTS } from "@/lib/restraint";
import { STAFF, type Role } from "@/lib/roles";
import { RecordTemplatesPanel } from "./panels/RecordTemplatesPanel";
import { MeProvider, RoleProvider } from "./RoleContext";
import { ToolRail } from "./ToolRail";

const patient = PATIENTS[0];
const today = { y: 2026, m: 11, d: 4 };
const facts = { patient, today, nowTime: "10:30" };
const noop = () => {};
const as = (role: Role, el: React.ReactElement) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{el}</MeProvider>
    </RoleProvider>,
  );

function fakeStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
  return store;
}
afterEach(() => vi.unstubAllGlobals());

describe("テンプレートの引き出し", () => {
  it("lists the doctor's templates with what each is for, a ★ to put it on the rail, and a way to make one's own", () => {
    const html = as("医師", <RecordTemplatesPanel facts={facts} onInsert={noop} onConfirm={noop} onOpenPanel={noop} />);
    for (const n of ["身体的拘束の記録", "救急医療管理加算の根拠", "ICの記録", "ICU 入室時の記録", "死亡時の記録", "口頭指示の記録"]) expect(html).toContain(n);
    expect(html).toContain("救急医療管理加算の根拠を右の道具に出す");
    expect(html).toContain("自分のテンプレートを作る");
    expect(html).toContain("記事の「テンプレート」と同じもの");
  });

  it("a nurse does not see the doctor-only 救急医療管理加算 but does see 転倒 and 褥瘡", () => {
    const html = as("看護師", <RecordTemplatesPanel facts={facts} onInsert={noop} onConfirm={noop} onOpenPanel={noop} />);
    expect(html).not.toContain("救急医療管理加算の根拠");
    expect(html).toContain("ICU 入室時の記録");
    expect(html).toContain("転倒・転落時の記録");
    expect(html).toContain("褥瘡の記録");
  });

  it("opens straight into a template's form: its items, the preview headed 【…】, what is still missing, and the two ways out", () => {
    const html = as("医師", <RecordTemplatesPanel facts={facts} initialId="rec-kyukyu" onInsert={noop} onConfirm={noop} onOpenPanel={noop} />);
    expect(html).toContain('aria-label="区分"');
    expect(html).toContain("オ ショック");
    expect(html).toContain('aria-label="根拠となる所見"');
    expect(html).toContain("【救急医療管理加算の根拠】");
    expect(html).toContain("判断した医師：山本（専攻医）");
    expect(html).toContain("「区分」がまだです");
    expect(html).toContain("「根拠となる所見」を書いてください");
    expect(html).toContain("記事に入れる");
    expect(html).toContain("記事として確定");
    // The confirm button waits for the form; the insert button does not.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>記事として確定<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>記事に入れる<\/button>/);
    expect(html).toContain("A205 救急医療管理加算");
  });

  it("the restraint form starts from the restraint in force and offers the existing record instead of a second one", () => {
    const r = INITIAL_RESTRAINTS[0];
    const html = as("看護師", <RecordTemplatesPanel facts={{ ...facts, restraint: r }} initialId="rec-restraint" onInsert={noop} onConfirm={noop} onOpenPanel={noop} />);
    expect(html).toContain("身体的拘束の記録（開始・見直し・解除）を開く");
    expect(html).toContain(`開始：${r.start.time}`);
    expect(html).toContain(`指示医：${r.doctor}`);
    expect(html).toContain("二重に記録しません");
  });

  it("a time field is a clock input", () => {
    const html = as("看護師", <RecordTemplatesPanel facts={facts} initialId="rec-fall" onInsert={noop} onConfirm={noop} onOpenPanel={noop} />);
    expect(html).toContain('type="text"');
    expect(html).toContain('aria-label="発見時刻"');
  });

  it("the billing clerk, who may not write notes, sees the buttons disabled with the reason", () => {
    const html = as("医事課", <RecordTemplatesPanel facts={facts} initialId="rec-fall" onInsert={noop} onConfirm={noop} onOpenPanel={noop} />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>記事に入れる<\/button>/);
  });
});

describe("右端ツールのテンプレート", () => {
  it("テンプレート is the first tool under その他", () => {
    const html = as("医師", <ToolRail open="templates" onOpen={noop} />);
    expect(html).toContain("テンプレート");
    expect(html.indexOf(">テンプレート<")).toBeLessThan(html.indexOf(">外来予約<"));
    expect(html).not.toContain(">同意書<");
  });

  it("a pinned template sits in お気に入り under its short name, lit when its form is open", () => {
    fakeStorage();
    saveRail(STAFF["医師"].name, { mode: "icons", pins: ["results", pinOfTemplate("rec-kyukyu"), pinOfTemplate("rec-fall")] });
    const html = as("医師", <ToolRail open="templates" openTemplate="rec-kyukyu" onOpen={noop} />);
    const fav = html.match(/<section aria-label="お気に入り"[\s\S]*?<\/section>/)![0];
    expect(fav).toContain("検査結果");
    expect(fav).toContain(">救急加算<");
    expect(fav).toContain(">転倒<");
    expect(fav).toMatch(/<button[^>]*title="救急加算"[^>]*aria-pressed="true"/);
    expect(fav).toMatch(/<button[^>]*title="転倒"[^>]*aria-pressed="false"/);
  });

  it("a pinned template whose id is unknown is left out, and an own template is named from this browser", () => {
    const store = fakeStorage();
    const me = STAFF["看護師"].name;
    store.set(`simple-karte:note-templates:${me}`, JSON.stringify([{ id: "own-1", name: "術後の観察", roles: ["看護師"], body: "創 {{選択:創:異常なし|発赤}}", by: me }]));
    saveRail(me, { mode: "icons", pins: [pinOfTemplate("gone"), pinOfTemplate("own-1")] });
    const html = as("看護師", <ToolRail open={null} onOpen={noop} />);
    const fav = html.match(/<section aria-label="お気に入り"[\s\S]*?<\/section>/)![0];
    expect(fav).toContain(">術後の観察<");
    expect(fav).not.toContain("gone");
  });
});

it("ICU のフォームと右端のお気に入りを開ける", () => {
  fakeStorage();
  saveRail(STAFF["医師"].name, { mode: "icons", pins: [pinOfTemplate("rec-icu-admit")] });
  const html = as("医師", <RecordTemplatesPanel facts={facts} initialId="rec-icu-admit" onInsert={noop} onConfirm={noop} onOpenPanel={noop} />);
  expect(html).toContain("ICU 入室時の記録を右の道具から外す");
  expect(html).toContain("SOFA 合計：未計算");
  const rail = as("医師", <ToolRail open="templates" openTemplate="rec-icu-admit" onOpen={noop} />);
  expect(rail).toContain(">ICU入室<");
  expect(html).not.toContain("架空の病院の取り決め");
});


describe("VTE のテンプレート", () => {
  it("医師と看護師の一覧と入力画面に出て、出典と未計算の見本を示す", () => {
    for (const role of ["医師", "看護師"] as const) {
      expect(as(role, <RecordTemplatesPanel facts={facts} onInsert={noop} onConfirm={noop} onOpenPanel={noop} />)).toContain("VTE（静脈血栓塞栓症）リスク評価");
      const html = as(role, <RecordTemplatesPanel facts={facts} initialId="rec-vte" onInsert={noop} onConfirm={noop} onOpenPanel={noop} />);
      expect(html).toContain("Padua 合計：未計算");
      expect(html).toContain("決めるのは医師");
      expect(html).toContain("04044.x");
      expect(html).toContain("JCS2017_ito_h.pdf");
    }
  });
});
