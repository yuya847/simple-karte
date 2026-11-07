"use client";

import { Bell, Database, KeyRound, Settings } from "lucide-react";
import { useState } from "react";
import type { LoginSettings, LoginUser } from "@/lib/login";
import type { PushRecords } from "@/lib/push/use-push";
import { SubTabs } from "./DeskParts";
import { LoginSettingsView } from "./LoginSettingsView";
import { MasterView } from "./MasterView";
import { PushSettingsView } from "./PushSettingsView";

type Tab = "master" | "login" | "push";

/** システム管理: the masters' hospital fields (マスタ管理), the login of this device (ログインと自動ログアウト), and notifications to phones (通知). */
export function SystemView({ nowTime, newId, login, push }: { nowTime: string; newId: () => string; login: { settings: LoginSettings; onChange: (s: LoginSettings) => void; users: LoginUser[] }; push: Pick<PushRecords, "subs" | "setSubs" | "prefs" | "setPrefs"> }) {
  const [tab, setTab] = useState<Tab>("master");
  return (
    <section aria-label="システム管理" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Settings size={18} className="text-ai" />
          システム管理
        </h1>
        <SubTabs
          label="システム管理の画面"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "master", label: "マスタ管理", icon: Database },
            { key: "login", label: "ログインと自動ログアウト", icon: KeyRound },
            { key: "push", label: "通知", icon: Bell },
          ]}
        />
      </header>
      <div className="px-5 py-4 text-[13px]">
        {tab === "master" && <MasterView nowTime={nowTime} newId={newId} />}
        {tab === "login" && <LoginSettingsView settings={login.settings} onChange={login.onChange} users={login.users} />}
        {tab === "push" && <PushSettingsView prefs={push.prefs} onPrefs={push.setPrefs} subs={push.subs} onSubs={push.setSubs} />}
      </div>
    </section>
  );
}
