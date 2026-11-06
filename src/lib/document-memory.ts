export interface DocumentMemory { stars: string[]; recent: string[] }
const memoryKey = (actor: string) => `karte-document-memory:${actor}`;
const changeEvent = "karte-document-memory-change";
export function parseDocumentMemory(raw: string): DocumentMemory {
  try {
    const value = JSON.parse(raw);
    const strings = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string"))] : [];
    return { stars: strings(value?.stars), recent: strings(value?.recent).slice(0, 10) };
  } catch { return { stars: [], recent: [] }; }
}
export function documentMemorySnapshot(actor: string): string {
  try { return localStorage.getItem(memoryKey(actor)) ?? ""; } catch { return ""; }
}
export function saveDocumentMemory(actor: string, memory: DocumentMemory): void {
  try { localStorage.setItem(memoryKey(actor), JSON.stringify(memory)); window.dispatchEvent(new Event(changeEvent)); } catch { /* Browser storage may be unavailable. */ }
}
export function rememberDocument(actor: string, id: string): void {
  const memory = parseDocumentMemory(documentMemorySnapshot(actor));
  saveDocumentMemory(actor, { ...memory, recent: [id, ...memory.recent.filter(item => item !== id)].slice(0, 10) });
}
export function subscribeDocumentMemory(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener(changeEvent, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(changeEvent, listener); };
}
