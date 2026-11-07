// The system screens (障害時の参照 …) render on the server with what they are given, and the offline page
// in public/downtime reads what the app keeps.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DOWNTIME_PAGE, DOWNTIME_STORE } from "@/lib/downtime";
import { PATIENTS } from "@/lib/patients";
import { currentEntries } from "@/lib/record";
import { STAFF, type Role } from "@/lib/roles";
import type { OrderEntry } from "@/lib/types";
import { DowntimeView } from "./DowntimeView";
import { MergedNotice, PresenceStrip } from "./Presence";
import { ScanPanel } from "./panels/ScanPanel";
import { withdraw, type ScanDoc } from "@/lib/scans";
import { SignBox } from "./panels/SignBox";
import { emptySections, type DischargeDraft } from "@/lib/discharge";
import { LoginGate } from "./LoginGate";
import { LoginSettingsView } from "./LoginSettingsView";
import { DEFAULT_LOGIN } from "@/lib/login";
import { MeProvider, RoleProvider } from "./RoleContext";

const today = { y: 2026, m: 11, d: 4 };
const as = (role: Role, node: React.ReactNode) =>
  renderToStaticMarkup(
    <RoleProvider value={role}>
      <MeProvider value={STAFF[role]}>{node}</MeProvider>
    </RoleProvider>,
  );
const pub = (f: string) => readFileSync(fileURLToPath(new URL(`../../public/downtime/${f}`, import.meta.url)), "utf8");

describe("障害時の参照の画面", () => {
  const rows = () => PATIENTS.map((p, i) => ({ patient: p, room: `50${i + 1}`, entries: currentEntries(p).filter((e): e is OrderEntry => e.kind === "order") }));
  it("shows each patient's essentials with the sources, and says it could not keep it here (no browser)", () => {
    const html = as("看護師", <DowntimeView places={["5階東病棟"]} rowsFor={rows} today={today} nowTime="10:00" mar={{}} sessionStart={480} limited={() => false} />);
    expect(html).toContain("障害時の参照");
    expect(html).toContain(PATIENTS[0].name);
    expect(html).toContain("有効な指示");
    expect(html).toContain("今日の与薬予定");
    expect(html).toContain("直近のバイタル");
    expect(html).toContain("実施（手書き）");
    expect(html).toContain("この端末のブラウザには保存されていません");
    expect(html).not.toContain("001716295.pdf");
    expect(html).toContain(DOWNTIME_PAGE);
  });

  it("has an offline page that reads the same key, runs only its own script, and caches only itself", () => {
    expect(pub("view.js")).toContain(`"${DOWNTIME_STORE}"`);
    const page = pub("index.html");
    expect(page).toContain("script-src 'self'");
    expect(page).toContain('<script src="/downtime/view.js"></script>');
    const sw = pub("sw.js");
    expect(sw).toContain('var FILES = ["/downtime/index.html", "/downtime/view.js"];');
    expect(sw).toContain("FILES.indexOf(url.pathname) < 0");
  });
});

describe("同時利用の警告", () => {
  it("names the others with the chart open, and stands out when one is writing", () => {
    const html = renderToStaticMarkup(<PresenceStrip peers={[{ tab: "b", who: "看護師 佐藤", role: "看護師", patient: "p1", editing: true, where: "タブ", seen: 0 }, { tab: "d", who: "山本（専攻医）", role: "医師", patient: "p1", editing: false, where: "端末", seen: 0 }]} />);
    expect(html).toContain("このカルテを開いている人");
    expect(html).toContain("看護師 佐藤（別のタブ・記事か下書きを書いています）");
    expect(html).toContain("山本（専攻医）（医師・別の端末）");
    expect(html).toContain("bg-yamabuki-soft");
    expect(renderToStaticMarkup(<PresenceStrip peers={[]} />)).toBe("");
  });

  it("names who is correcting which note, and says whose changes were merged in instead of stopping", () => {
    const editor = { tab: "e", who: "看護師 佐藤", role: "看護師", patient: "p1", note: "n1", label: "10:32 の記事", text: "S) 熱はない", cursor: 3, seen: 0 };
    const html = renderToStaticMarkup(<PresenceStrip peers={[]} editors={[editor]} />);
    expect(html).toContain("看護師 佐藤（10:32 の記事を修正中）");
    expect(html).toContain("bg-yamabuki-soft");
    const notice = renderToStaticMarkup(<MergedNotice by="看護師 佐藤" where="タブ" at="10:32" onClose={() => {}} />);
    expect(notice).toContain("看護師 佐藤さんの変更を取り込みました（別のタブ・10:32 の保存）。");
    expect(notice).not.toContain("保存を止めています");
  });
});

describe("スキャン取込", () => {
  const p = PATIENTS[0];
  const kept: ScanDoc = { id: "s1", patientId: p.id, type: "同意書", docDate: "2026-11-02", note: "外来で署名", by: "医事課 渡辺", role: "医事課", at: { day: 0, time: "09:10" }, mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA", bytes: 28, original: { name: "見本.jpg", type: "image/jpeg", bytes: 90 }, sample: true };
  it("warns not to take in real papers, and lists what was taken in with the type, date and who", () => {
    const html = as("医事課", <ScanPanel patient={p} scans={[kept, withdraw({ ...kept, id: "s2", type: "問診票" }, "医事課 渡辺", { day: 0, time: "09:30" }, "別の患者の紙")]} today="11/4（水）" onAdd={() => {}} onWithdraw={() => {}} />);
    expect(html).toContain("実在の患者や医療機関の書類・写真は取り込まないでください");
    expect(html).toContain("見本を作る");
    expect(html).toContain("同意書</b>　文書の日付 2026-11-02");
    expect(html).toContain("取込 09:10 医事課 渡辺");
    expect(html).toContain("取り消し 09:30 医事課 渡辺：別の患者の紙");
    expect(html).not.toContain("項番168");
    expect(html).toContain("取り込んだ文書（2件）");
  });
});

describe("電子署名（模擬）", () => {
  const draft: DischargeDraft = { patientId: "p1", dischargeDay: 1, destination: "自宅", outcome: "1", route: "1", sections: emptySections(), status: "確定", confirmedAt: { day: 0, time: "10:00" }, confirmedBy: "山本（専攻医）", letter: { to: "", dept: "", doctor: "", purpose: "" } };
  const rec = { id: "g1", patientId: "p1", kind: "退院時サマリー" as const, docHash: "a".repeat(64), signature: "MEUC".repeat(20), keyId: "3fa2".repeat(8), signer: "山本（専攻医）", role: "医師", at: { date: "2026-11-04", time: "10:32:05" }, alg: "ECDSA P-256 / SHA-256（模擬）" as const };
  it("lets a doctor sign the confirmed summary (a 紹介状 is signed in the letter tool), shows the signatures and says what it is not", () => {
    const html = as("医師", <SignBox patientId="p1" draft={draft} records={[rec]} onSigned={() => {}} newId={() => "x"} />);
    expect(html).toContain("模擬");
    expect(html).not.toContain("HPKI（保健医療福祉分野の公開鍵基盤）");
    expect(html).not.toContain("法的な署名にはなりません");
    expect(html).toContain("確定済み");
    expect(html).not.toContain("診療情報提供書");
    const issued = { ...draft, letter: { ...draft.letter, to: "架空みどり病院", issuedAt: { day: 0, time: "11:00" } } };
    expect(as("医師", <SignBox patientId="p1" draft={issued} records={[]} onSigned={() => {}} newId={() => "x"} />)).toContain("<b>診療情報提供書</b><span class=\"text-ink-soft\">発行済み</span>");
    expect(html).toContain("署名 2026-11-04 10:32:05");
    expect(html).toContain("鍵の指紋 3fa23fa2…");
    expect(html).not.toContain("企画管理編」14");
    expect(html).not.toContain("医師が行います");
  });
  it("is locked for a nurse", () => {
    expect(as("看護師", <SignBox patientId="p1" draft={draft} records={[]} onSigned={() => {}} newId={() => "x"} />)).toContain("医師が行います");
  });
});

describe("ログインの仕組み（既定はオフ）", () => {
  const users = [
    { name: "山本（専攻医）", role: "医師" as const },
    { name: "看護師 佐藤", role: "看護師" as const },
  ];
  it("is off at first, says it applies to this device only, and where the rules come from", () => {
    const html = as("医事課", <LoginSettingsView settings={DEFAULT_LOGIN} onChange={() => {}} users={users} />);
    expect(html).toContain("ログインの仕組みを使う");
    expect(html).not.toContain("checked");
    expect(html).toContain("この端末のみに適用されます");
    expect(html).toContain("13文字以上");
    expect(html).not.toContain("項番171〜173");
    expect(html).not.toContain("12.3.2");
  });
  it("asks who uses it, without showing the chart, and keeps a way out for the demo", () => {
    const html = renderToStaticMarkup(<LoginGate users={users} locked={null} current={null} onLogin={() => {}} onTurnOff={() => {}} />);
    expect(html).toContain("だれが使いますか");
    expect(html).toContain("看護師 佐藤");
    expect(html).toContain("（この端末では初めて）");
    expect(html).toContain("ログインの仕組みを切る（この端末・デモ用）");
    expect(html).not.toContain("二要素認証はありません");
    const locked = renderToStaticMarkup(<LoginGate users={users} locked={{ at: "10:45", minutes: 15 }} current={users[1]} onLogin={() => {}} onTurnOff={() => {}} />);
    expect(locked).toContain("15分操作がなかったので、10:45 に画面をロックしました");
    expect(locked).toContain("パスワードを決めてログイン");
    expect(locked).toContain("別の人でログイン");
  });
});
