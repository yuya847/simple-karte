// Chat in the hospital (fictional): channels for the whole hospital and the nursing department, and
// one thread per patient. Chat is for getting in touch; what was decided goes into the chart (a
// message can be copied into the note with who wrote it and when). No AI here.
//
// In this prototype messages live in the browser's memory and are shared between tabs of the same
// browser (BroadcastChannel). A real system would keep them on the hospital's server.

import { useSyncExternalStore } from "react";

export type ChatRole = "医師" | "看護師" | "薬剤師" | "臨床工学技士" | "医事課" | "管理者";

export interface ChatMessage {
  id: string;
  channel: string;
  /** "HH:MM" and day offset. */
  at: { day: number; time: string };
  author: string;
  role: ChatRole;
  text: string;
  /** Marked as urgent by the sender. */
  urgent?: boolean;
  /** Copied into the chart's note. */
  charted?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  kind: "院内" | "部署" | "患者";
  /** For patient threads. */
  patientId?: string;
  description: string;
}

export const FIXED_CHANNELS: Channel[] = [
  { id: "hospital", name: "院内（全体）", kind: "院内", description: "院内の全職員へのお知らせ（架空）" },
  { id: "nursing", name: "看護部", kind: "部署", description: "看護部の連絡（架空）" },
  { id: "ward-5e", name: "5階東 病棟", kind: "部署", description: "5階東病棟の医師・看護師・薬剤師（架空）" },
  { id: "pharmacy", name: "薬剤部", kind: "部署", description: "薬剤部への問い合わせ（架空）" },
];

export const patientChannel = (patientId: string) => `patient-${patientId}`;

/** FICTIONAL starting messages. */
export const SEED: ChatMessage[] = [
  { id: "s1", channel: "hospital", at: { day: 0, time: "07:45" }, author: "医療安全管理室（架空）", role: "管理者", text: "本日 17:30〜 医療安全研修（中心静脈カテーテル挿入時の確認）。対象の医師は参加してください。" },
  { id: "s2", channel: "hospital", at: { day: 0, time: "08:02" }, author: "情報システム課（架空）", role: "管理者", text: "今夜 23:00〜24:00 は電子カルテの定期保守です。紙運用の手順は各部署のファイルを見てください。" },
  { id: "s3", channel: "nursing", at: { day: 0, time: "07:30" }, author: "看護部長（架空）", role: "看護師", text: "インフルエンザの院内発生が1件ありました。各病棟で面会制限の掲示をお願いします。" },
  { id: "s4", channel: "nursing", at: { day: 0, time: "08:10" }, author: "5階東 師長（架空）", role: "看護師", text: "5階東、日勤は1名欠員のため、10時から応援1名が入ります。" },
  { id: "s5", channel: "ward-5e", at: { day: 0, time: "08:30" }, author: "看護師 渡辺（架空）", role: "看護師", text: "515B 大浦さん、昨夜から痰が多く吸引3回。朝の SpO2 は 95%（鼻カニュラ 1L）です。" },
  { id: "s6", channel: patientChannel("90010231"), at: { day: -1, time: "22:10" }, author: "看護師 佐々木（架空）", role: "看護師", text: "佐倉さん、夜間に右下腿の痛みの訴えがありました。痛み止めの頓用の指示をお願いできますか。" },
  { id: "s7", channel: patientChannel("90010231"), at: { day: 0, time: "07:05" }, author: "看護師 佐々木（架空）", role: "看護師", text: "右下腿の発赤はマーキングの内側で縮小しています。写真を撮りました。" },
  { id: "s8", channel: patientChannel("90010244"), at: { day: 0, time: "06:40" }, author: "看護師 渡辺（架空）", role: "看護師", text: "大浦さんの長女さんから、今日の午後に面会と病状説明を希望と電話がありました。何時ごろがよいですか。", urgent: false },
];

// ---- store (append and mark only) ----
let messages: ChatMessage[] = SEED;
const read = new Map<string, number>(); // channel → number of messages read
const listeners = new Set<() => void>();
const bc = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("simple-karte-chat") : null;
const emit = () => listeners.forEach((l) => l());

bc?.addEventListener("message", (e: MessageEvent<{ kind: "add"; m: ChatMessage } | { kind: "chart"; id: string }>) => {
  const d = e.data;
  if (d.kind === "add") {
    const added = d.m;
    if (!messages.some((m) => m.id === added.id)) messages = [...messages, added];
  } else {
    const id = d.id;
    messages = messages.map((m) => (m.id === id ? { ...m, charted: true } : m));
  }
  emit();
});

export function postMessage(m: ChatMessage) {
  messages = [...messages, m];
  bc?.postMessage({ kind: "add", m });
  emit();
}

export function markCharted(id: string) {
  messages = messages.map((m) => (m.id === id ? { ...m, charted: true } : m));
  bc?.postMessage({ kind: "chart", id });
  emit();
}

export function markRead(channel: string) {
  read.set(channel, messages.filter((m) => m.channel === channel).length);
  emit();
}

let readSnap = { messages, read: new Map(read) };
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => {
  if (readSnap.messages !== messages || readSnap.read.size !== read.size || [...read].some(([k, v]) => readSnap.read.get(k) !== v)) readSnap = { messages, read: new Map(read) };
  return readSnap;
};
const serverSnap = { messages: SEED, read: new Map<string, number>() };

export function useChat() {
  return useSyncExternalStore(subscribe, snapshot, () => serverSnap);
}

export function unreadCount(state: { messages: ChatMessage[]; read: Map<string, number> }, channel: string): number {
  return Math.max(0, state.messages.filter((m) => m.channel === channel).length - (state.read.get(channel) ?? 0));
}

/** Copy a message into the chart's note (who, when, what). */
export const chartLine = (m: ChatMessage, dayLabel: string) => `・チャット（${dayLabel} ${m.at.time} ${m.author}）：${m.text}`;
