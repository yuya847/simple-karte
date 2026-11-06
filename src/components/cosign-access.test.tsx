// The new screens render (on the server, without a browser) with what they are given.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EXAMPLE_LIMIT } from "@/lib/access-limit";
import { confirmItems, newItems } from "@/lib/cosign";
import { PATIENTS } from "@/lib/patients";
import { GlassStep, LimitPanel, LimitStrip } from "./AccessLimit";
import { AccessLog } from "./AccessLog";
import { CosignList, CosignMark, CosignPanel, CosignRefs, CosignStrip } from "./Cosign";
import { MeProvider, RoleProvider } from "./RoleContext";

const mori = PATIENTS.find((p) => p.id === "90010260")!;
let n = 0;
const items = newItems({ patientId: "90010231", by: "研修医 田中", at: { day: 0, time: "09:00" } }, [
  { ref: "note-1", kind: "記事", text: "S) 熱はない" },
  { ref: "order-1", kind: "オーダ", text: "セファゾリン 2g" },
], () => `i${++n}`);
const done = confirmItems(items, [items[1].id], "指導医 高橋", { day: 0, time: "10:30" }).items;

describe("研修医の記録の確認の画面", () => {
  it("the strip: 指導医 sees 確認 and まとめて; the 研修医 sees who confirms", () => {
    const boss = renderToStaticMarkup(<CosignStrip items={items} meName="指導医 高橋" onConfirm={() => {}} />);
    expect(boss).toContain("指導医の確認待ち 2件");
    expect(boss).toContain("表示中の2件をまとめて確認");
    const self = renderToStaticMarkup(<CosignStrip items={items} meName="研修医 田中" onConfirm={() => {}} />);
    expect(self).not.toContain("まとめて確認");
    expect(self).toContain("指導医か上級医です");
    expect(renderToStaticMarkup(<CosignStrip items={done.slice(1)} meName="指導医 高橋" onConfirm={() => {}} />)).toBe("");
  });

  it("the mark on the record and the ward list", () => {
    const marks = renderToStaticMarkup(
      <CosignRefs value={{ "note-1": done[0], "order-1": done[1] }}>
        <CosignMark refId="note-1" />
        <CosignMark refId="order-1" />
        <CosignMark refId="other" />
      </CosignRefs>,
    );
    expect(marks).toContain("指導医の確認待ち");
    expect(marks).toContain("確認 指導医 高橋 10:30");
    const list = renderToStaticMarkup(<CosignList items={done} meName="山本（専攻医）" patientOf={() => ({ name: "佐倉 修", room: "512" })} onConfirm={() => {}} onOpen={() => {}} />);
    expect(list).toContain("研修医の記録の確認");
    expect(list).toContain("512 佐倉 修");
    expect(list).not.toContain("架空の病院の取り決め");
    expect(list).toContain("https://www.mhlw.go.jp/content/001364766.pdf");
  });
});

describe("閲覧制限の画面", () => {
  it("the reason step shows the care team and the reasons", () => {
    const html = renderToStaticMarkup(<GlassStep patient={mori} me="薬剤師 小林" onOpen={() => {}} onBack={() => {}} />);
    expect(html).toContain("閲覧制限の患者です");
    expect(html).toContain("511 森 久美子");
    expect(html).toContain("看護師 伊藤");
    expect(html).toContain("当直・休日の診療");
    expect(html).toContain("理由を残して開く");
  });

  it("the strip and the panel", () => {
    const strip = renderToStaticMarkup(<LimitStrip limit={EXAMPLE_LIMIT} inTeam fmtDay={(d) => `${d}日`} />);
    expect(strip).toContain("閲覧制限（職員）");
    expect(strip).toContain("担当チームとして開いています");
    const panel = renderToStaticMarkup(<LimitPanel history={[EXAMPLE_LIMIT]} current={EXAMPLE_LIMIT} fmtDay={(d) => `${d}日`} onSave={() => {}} />);
    expect(panel).toContain("閲覧制限を外す");
    expect(panel).toContain("設定（職員）");
  });

  it("the access log renders inside the role", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="医事課">
        <MeProvider value={{ role: "医事課", name: "医事課 渡辺" }}>
          <AccessLog />
        </MeProvider>
      </RoleProvider>,
    );
    expect(html).toContain("閲覧制限の患者だけ");
    expect(html).toContain("CSV（comma-separated values、カンマ区切りの表）で書き出す");
  });
});

describe("右端ツール「文書」の「研修医の記録の確認」の引き出し", () => {
  it("waiting records with 確認; the confirmed ones (who and when) under them", () => {
    const html = renderToStaticMarkup(<CosignPanel items={done} meName="指導医 高橋" onConfirm={() => {}} />);
    expect(html).toContain("指導医の確認待ち 1件");
    expect(html).toContain("確認済み 1件");
    expect(html).toContain("確認 指導医 高橋 10:30");
    expect(html).not.toContain("確認待ちはありません");
  });
  it("nothing waiting: says so", () => {
    const html = renderToStaticMarkup(<CosignPanel items={done.slice(1)} meName="指導医 高橋" onConfirm={() => {}} />);
    expect(html).toContain("この患者の研修医の記録に、確認待ちはありません。");
    expect(html).toContain("確認済み 1件");
  });
});

it("研修医の指示簿も確認一覧に並び、確認後は確認者と時刻を残す", () => {
  const standing = newItems({ patientId: "90010231", by: "研修医 田中", at: { day: 0, time: "11:00" } }, [{ ref: "standing:90010231:2", kind: "指示簿", text: "安静度：室内" }], () => "standing-review");
  const pending = renderToStaticMarkup(<CosignPanel items={standing} meName="指導医 高橋" onConfirm={() => {}} />);
  expect(pending).toContain("指示簿");
  expect(pending).toContain("安静度：室内");
  expect(pending).toContain("指導医の確認待ち 1件");
  const confirmed = confirmItems(standing, [standing[0].id], "指導医 高橋", { day: 0, time: "11:30" }).items;
  const html = renderToStaticMarkup(<CosignPanel items={confirmed} meName="指導医 高橋" onConfirm={() => {}} />);
  expect(html).toContain("確認 指導医 高橋 11:30");
  expect(html).not.toContain("指導医の確認待ち 1件");
});
