"use client";

import { Database, Settings } from "lucide-react";
import { useState } from "react";
import { SubTabs } from "./DeskParts";
import { MasterView } from "./MasterView";

type Tab = "master";

/** システム管理: the masters' hospital fields (マスタ管理). */
export function SystemView({ nowTime, newId }: { nowTime: string; newId: () => string }) {
  const [tab, setTab] = useState<Tab>("master");
  return (
    <section aria-label="システム管理" className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-sheet px-5 py-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <Settings size={18} className="text-ai" />
          システム管理
        </h1>
        <SubTabs label="システム管理の画面" value={tab} onChange={setTab} tabs={[{ key: "master", label: "マスタ管理", icon: Database }]} />
      </header>
      <div className="px-5 py-4 text-[13px]">{tab === "master" && <MasterView nowTime={nowTime} newId={newId} />}</div>
    </section>
  );
}
