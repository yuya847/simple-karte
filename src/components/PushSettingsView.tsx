"use client";

import { useState } from "react";
import { auditLog } from "@/lib/audit";
import { activeSubs, type PushPrefs, type PushSub } from "@/lib/push/push";
import { useMe } from "./RoleContext";

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
};

/** システム管理 › 通知: the hospital's choice to put a pseudonym and the value in notifications (off by default), and the devices that receive. */
export function PushSettingsView({ prefs, onPrefs, subs, onSubs }: { prefs: PushPrefs; onPrefs: (p: PushPrefs) => void; subs: PushSub[]; onSubs: (s: PushSub[]) => void }) {
  const me = useMe();
  const [checked, setChecked] = useState(false);
  const devices = activeSubs(subs).sort((a, b) => b.iso.localeCompare(a.iso));
  const turn = (detail: boolean) => {
    onPrefs({ detail, by: me.name, iso: new Date().toISOString(), ...(detail ? { rulesChecked: true } : {}) });
    auditLog({ role: me.role, actor: me.name, action: detail ? "通知に仮の ID と値を入れるようにした（院内の決まりを確かめた）" : "通知に仮の ID と値を入れないようにした" });
    setChecked(false);
  };
  const remove = (s: PushSub) => {
    onSubs(subs.map((x) => (x.id === s.id ? { ...x, sub: null, stopped: { iso: new Date().toISOString(), by: me.name } } : x)));
    auditLog({ role: me.role, actor: me.name, action: "通知を受ける端末を外した", detail: `${s.role} ${s.name}（${s.device}）` });
  };
  return (
    <div className="max-w-3xl space-y-4">
      <section className="space-y-2 rounded-md border border-rule bg-sheet p-3">
        <label className="flex w-fit items-center gap-2 text-sm font-bold has-[:disabled]:text-ink-faint">
          <input type="checkbox" checked={prefs.detail} disabled={!prefs.detail && !checked} onChange={(e) => turn(e.target.checked)} />
          通知に仮の ID と値を入れる
        </label>
        {!prefs.detail && (
          <label className="flex w-fit items-center gap-2 pl-6 text-[13px]">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            院内の決まり（私物の端末の扱い）を確かめた
          </label>
        )}
        {prefs.by && prefs.iso && (
          <p className="text-[12px] text-ink-faint">
            {prefs.detail ? "入れる" : "入れない"}：{prefs.by}　<span className="nums">{when(prefs.iso)}</span>
          </p>
        )}
      </section>
      <section className="rounded-md border border-rule bg-sheet p-3">
        <h2 className="mb-1 text-sm font-bold">
          通知を受ける端末<span className="nums">（{devices.length}）</span>
        </h2>
        {devices.length === 0 ? (
          <p className="text-[12px] text-ink-faint">まだありません。</p>
        ) : (
          <ul className="divide-y divide-rule-soft text-[12px]">
            {devices.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-1">
                <span className="w-12 text-ink-soft">{s.role}</span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-ink-soft">{s.device}</span>
                <span className="nums w-24 text-right text-ink-faint">{when(s.iso)}</span>
                <button type="button" onClick={() => remove(s)} className="rounded border border-rule px-2 py-0.5 hover:border-shu hover:text-shu">
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
