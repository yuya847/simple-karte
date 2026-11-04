"use client";

// ログインの仕組み（既定はオフ）in the page: the setting of this device, who is logged in, and the screen lock
// after the minutes without use. See login.ts for the rules.

import { useEffect, useRef, useState } from "react";
import { auditLog } from "./audit";
import { idleOver, loadLoginSettings, saveLoginSettings, type LoginSettings, type LoginUser } from "./login";

export function useLogin() {
  // Read in the browser when the page opens (the page shows nothing before that).
  const [settings, setSettings] = useState<LoginSettings>(() => loadLoginSettings());
  const [session, setSession] = useState<LoginUser | null>(null);
  const [locked, setLocked] = useState<{ at: string; minutes: number } | null>(null);
  const last = useRef(0);

  // 自動ログアウト（画面ロック）: no key press, touch or scroll for the minutes set.
  useEffect(() => {
    if (!settings.on || !session || locked) return;
    last.current = Date.now();
    const seen = () => (last.current = Date.now());
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, seen, { passive: true });
    const t = setInterval(() => {
      if (!idleOver(last.current, Date.now(), settings.idleMinutes)) return;
      const at = new Date().toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
      auditLog({ role: session.role, actor: session.name, action: `自動ログアウト（${settings.idleMinutes}分操作がなく画面をロックした）` });
      setLocked({ at, minutes: settings.idleMinutes });
    }, 10_000);
    return () => {
      for (const e of events) window.removeEventListener(e, seen);
      clearInterval(t);
    };
  }, [settings.on, settings.idleMinutes, session, locked]);

  const change = (next: LoginSettings, by: { name: string; role: LoginUser["role"] }) => {
    saveLoginSettings(next);
    setSettings(next);
    if (next.on !== settings.on) auditLog({ role: by.role, actor: by.name, action: next.on ? "ログインの仕組みを入れた（この端末）" : "ログインの仕組みを切った（この端末）" });
    else if (next.idleMinutes !== settings.idleMinutes) auditLog({ role: by.role, actor: by.name, action: `自動ログアウトの時間を${next.idleMinutes}分にした（この端末）` });
    if (!next.on) {
      setSession(null);
      setLocked(null);
    }
  };

  return {
    settings,
    session,
    locked,
    /** The login screen is in front (the app behind it is not shown). */
    gate: settings.on && (!session || !!locked),
    change,
    start: (u: LoginUser) => {
      setSession(u);
      setLocked(null);
    },
    logout: () => {
      if (session) auditLog({ role: session.role, actor: session.name, action: "ログアウトした" });
      setSession(null);
      setLocked(null);
    },
    lock: () => {
      if (!session) return;
      auditLog({ role: session.role, actor: session.name, action: "画面をロックした" });
      setLocked({ at: new Date().toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }), minutes: 0 });
    },
  };
}
