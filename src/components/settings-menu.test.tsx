// 設定（右上の歯車）: drawn on the server (no browser). The window has 見た目・字の大きさ・右の道具 as choices, one
// line of note, and the button sits just left of the person's menu.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STAFF } from "@/lib/roles";
import { MeProvider, RoleProvider } from "./RoleContext";
import type { PushDevice } from "@/lib/push/use-push";
import { SettingsButton, SettingsPanel } from "./SettingsMenu";

const panel = (hiddenCount = 0) =>
  renderToStaticMarkup(<SettingsPanel value={{ theme: "dark", font: "lg" }} onChange={() => {}} railMode="list" onRailMode={() => {}} hiddenCount={hiddenCount} onShowAll={() => {}} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("設定のウインドウ", () => {
  it("見た目（紙・白・ダーク・くっきり）・字の大きさ（小・標準・大）・右の道具（アイコン・名前の一覧）を選ぶ。選んでいるものに印", () => {
    const html = panel();
    expect([...html.matchAll(/<legend[^>]*>([^<]+)<\/legend>/g)].map((m) => m[1])).toEqual(["見た目", "字の大きさ", "右の道具"]);
    const radios = (html.match(/<input[^>]*>/g) ?? []).map((i) => ({ name: i.match(/name="([a-z]+)"/)?.[1], value: i.match(/value="([a-z]+)"/)?.[1], on: i.includes('checked=""') }));
    for (const [name, values] of [["theme", ["paper", "white", "dark", "contrast"]], ["font", ["sm", "md", "lg"]], ["rail", ["icons", "list"]]] as const) {
      expect(radios.filter((r) => r.name === name).map((r) => r.value)).toEqual(values);
    }
    expect(radios.filter((r) => r.on).map((r) => `${r.name}:${r.value}`)).toEqual(["theme:dark", "font:lg", "rail:list"]);
  });

  it("文字は選ぶ名前と「この端末のみに適用されます」の1行だけ。隠した道具がなければ「全部戻す」は押せない", () => {
    expect(text(panel())).toBe("見た目 あ 紙 あ 白 あ ダーク あ くっきり 字の大きさ あ 小 あ 標準 あ 大 右の道具 アイコン 名前の一覧 隠した道具を全部戻す この端末のみに適用されます");
    expect(panel()).toMatch(/<button type="button" disabled=""[^>]*>隠した道具を全部戻す<\/button>/);
    expect(panel(3)).toMatch(/<button type="button"(?! disabled)[^>]*>隠した道具を全部戻す<span class="nums">（3）<\/span><\/button>/);
  });

  it("医師・看護師には「通知」：この端末に通知を受ける／通知を止める。使えないときは灰色で、理由は title", () => {
    const device = (x: Partial<PushDevice>): PushDevice => ({ state: "off", reason: null, error: null, turnOn: () => {}, turnOff: () => {}, ...x });
    const withPush = (d: PushDevice) => renderToStaticMarkup(<SettingsPanel value={{ theme: "paper", font: "md" }} onChange={() => {}} railMode="icons" onRailMode={() => {}} hiddenCount={0} onShowAll={() => {}} push={d} />);
    expect(text(withPush(device({})))).toBe("見た目 あ 紙 あ 白 あ ダーク あ くっきり 字の大きさ あ 小 あ 標準 あ 大 右の道具 アイコン 名前の一覧 隠した道具を全部戻す 通知 この端末に通知を受ける この端末のみに適用されます");
    expect(withPush(device({}))).toMatch(/<button type="button"(?! disabled)[^>]*>.*この端末に通知を受ける<\/button>/);
    expect(text(withPush(device({ state: "on" })))).toContain("通知 通知を止める");
    const off = withPush(device({ reason: "通知の鍵（VAPID）が設定されていません" }));
    expect(off).toMatch(/<button type="button" disabled="" title="通知の鍵（VAPID）が設定されていません"/);
    expect(text(off)).not.toContain("VAPID");
    expect(text(withPush(device({ error: "通知が許可されませんでした" })))).toContain("通知が許可されませんでした");
  });

  it("歯車のボタンは「設定」の名前を持ち、閉じているときはウインドウを出さない", () => {
    const html = renderToStaticMarkup(
      <RoleProvider value="医師">
        <MeProvider value={STAFF["医師"]}>
          <SettingsButton className="bar" />
        </MeProvider>
      </RoleProvider>,
    );
    expect(html).toMatch(/<button type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="設定" title="設定" class="bar">/);
    expect(html).toContain("lucide-settings");
    expect(html).not.toContain('role="dialog"');
  });

  it("上の段で、人の名前のメニューのすぐ左に置く", () => {
    const src = readFileSync(fileURLToPath(new URL("./AppFrame.tsx", import.meta.url)), "utf8");
    const gear = src.indexOf("<SettingsButton className={barButton} />");
    expect(gear).toBeGreaterThan(0);
    expect(src.slice(gear).trimStart().indexOf("<UserButton")).toBeLessThan(80);
  });
});
