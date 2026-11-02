"use client";

import { LayoutGrid, Plus, Search, X } from "lucide-react";
import type { Patient } from "@/lib/types";

interface Props {
  tabs: Patient[];
  activeId: string | null;
  mapActive: boolean;
  onSelectMap: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onOpenPicker: () => void;
}

/** Browser-style tabs: one tab per open patient chart. */
export function PatientTabs({ tabs, activeId, mapActive, onSelectMap, onSelect, onClose, onOpenPicker }: Props) {
  return (
    <div className="flex items-end gap-1 bg-tab px-2 pt-1.5 border-b border-rule">
      <div className="flex items-center gap-2 pr-3 pb-1.5 text-sm font-bold tracking-wide text-ink">
        <span className="inline-block h-4 w-1.5 rounded-sm bg-ai" aria-hidden />
        Simple Karte
      </div>
      <div role="tablist" aria-label="開いている患者" className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto scroll-thin">
        <button
          type="button"
          role="tab"
          aria-selected={mapActive}
          onClick={onSelectMap}
          title="病棟マップ"
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 px-3 text-sm ${
            mapActive ? "z-10 -mb-px border-rule bg-paper font-bold text-ink" : "border-transparent text-ink-soft hover:bg-sheet/60"
          }`}
        >
          <LayoutGrid size={15} />
          病棟マップ
        </button>
        {tabs.map((p) => {
          const active = p.id === activeId;
          return (
            <div
              key={p.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(p.id);
              }}
              onAuxClick={(e) => {
                if (e.button === 1) onClose(p.id);
              }}
              className={`group relative flex h-9 min-w-36 max-w-60 cursor-pointer items-center gap-2 rounded-t-lg border border-b-0 px-3 text-sm ${
                active
                  ? "z-10 -mb-px border-rule bg-sheet text-ink"
                  : "border-transparent bg-transparent text-ink-soft hover:bg-sheet/60"
              }`}
            >
              {p.infections.length > 0 && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-fuji" title={`感染症：${p.infections.join("、")}`} />
              )}
              <span className="truncate font-bold">{p.name}</span>
              <span className="nums shrink-0 text-xs text-ink-faint">{p.room}</span>
              <button
                type="button"
                aria-label={`${p.name} のカルテを閉じる`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(p.id);
                }}
                className="ml-auto rounded p-0.5 text-ink-faint opacity-60 hover:bg-tab hover:text-ink group-hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={onOpenPicker}
          aria-label="患者を開く"
          className="mb-1 rounded-md p-1.5 text-ink-soft hover:bg-sheet/70 hover:text-ink"
        >
          <Plus size={16} />
        </button>
      </div>
      <button
        type="button"
        onClick={onOpenPicker}
        className="mb-1.5 flex items-center gap-2 rounded-md border border-rule bg-sheet px-2.5 py-1 text-xs text-ink-soft hover:text-ink"
      >
        <Search size={13} />
        患者を開く
        <kbd className="rounded border border-rule px-1 text-[10px]">⌘K</kbd>
      </button>
    </div>
  );
}
