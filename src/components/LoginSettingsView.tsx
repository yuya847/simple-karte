"use client";

import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { forgetPassword, IDLE_CHOICES, loadPasswords, LOCK_RULE, LOGIN_SOURCES, PASSWORD_RULE, type LoginSettings, type LoginUser } from "@/lib/login";
import { Fictional, Sources } from "./DeskParts";
import { useMe } from "./RoleContext";

/** システム管理 › ログインと自動ログアウト: the switch of this device (off by default) and what it does. */
export function LoginSettingsView({ settings, onChange, users }: { settings: LoginSettings; onChange: (s: LoginSettings) => void; users: LoginUser[] }) {
  const me = useMe();
  const [, rerender] = useState(0);
  const kept = loadPasswords();
  const withPassword = users.filter((u) => kept[u.name]);
  return (
    <div className="max-w-3xl space-y-4">
      <section className="space-y-2 rounded-md border border-rule bg-sheet p-3">
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={settings.on} onChange={(e) => onChange({ ...settings, on: e.target.checked })} />
          ログインの仕組みを使う
          <span className="text-[12px] font-normal text-ink-soft">（初めは切っています。この端末のみに適用されます）</span>
        </label>
        <p className="text-[12px] text-ink-soft">
          入れると、画面を開いたときにログインの画面が出て、人を選んでパスワードを入れます。職種はログインした人のものになり、「自分」のメニューは職種の切り替えの代わりに「ログアウト」「画面をロック」になります。切っているときは、これまでどおり「自分」で職種を選びます（試すときに手間がかからないように）。
        </p>
        <label className="flex items-center gap-2 text-[13px]">
          自動ログアウト（画面ロック）まで
          <select value={settings.idleMinutes} onChange={(e) => onChange({ ...settings, idleMinutes: Number(e.target.value) })} className="rounded border border-rule bg-paper px-1.5 py-0.5">
            {IDLE_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m}分
              </option>
            ))}
          </select>
          操作がないとき
        </label>
        <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-ink-soft">
          <li>パスワードは人ごとに、この端末で初めてログインするときに決めます（{PASSWORD_RULE.min}文字以上、英字と数字を混ぜる。二要素認証がないため）。リポジトリにも保存先（Supabase）にもパスワードは入らず、この端末のブラウザに元に戻せない形（ソルトつきの PBKDF2-SHA256 のハッシュ）でだけ残ります。</li>
          <li>
            {LOCK_RULE.tries}回続けて違うと{LOCK_RULE.minutes}分ログインできません。ログイン・失敗・ログアウト・画面ロックは監査ログに残ります。
            <span className="hint">
              <Fictional text="回数と分の設定" />
            </span>
          </li>
          <li>二要素認証（パスワードともう一つ）はありません。実際の電子カルテでは、令和9年度に向けて二要素認証が求められます（ガイドライン システム運用編 14 ⑤）。</li>
          <li>実際の運用でサーバーの認証（Supabase Auth など）につなぐときの手順は README の「ログインの仕組み」にあります（この試作では切ったままです）。</li>
        </ul>
      </section>
      <section className="rounded-md border border-rule bg-sheet p-3">
        <h2 className="mb-1 text-sm font-bold">この端末でパスワードを決めた人（{withPassword.length}人）</h2>
        {withPassword.length === 0 ? (
          <p className="text-[12px] text-ink-faint">まだいません。</p>
        ) : (
          <ul className="space-y-1 text-[12px]">
            {withPassword.map((u) => (
              <li key={u.name} className="flex items-center gap-2">
                {u.name}
                <span className="text-ink-faint">{u.role}</span>
                <button
                  type="button"
                  onClick={() => {
                    forgetPassword(u.name);
                    auditLog({ role: me.role, actor: me.name, action: "この端末のパスワードを消した", detail: u.name });
                    rerender((n) => n + 1);
                  }}
                  className="ml-auto rounded border border-rule px-2 py-0.5 hover:border-shu hover:text-shu"
                >
                  この端末から消す
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Sources items={LOGIN_SOURCES} />
    </div>
  );
}
