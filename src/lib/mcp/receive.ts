import { useEffect } from "react";
import { decodePayload } from "./payload";
import { draftsFromAi, type Draft } from "../drafts";
import { auditLog } from "../audit";

export function readMcpDraft(hash: string, patientId: string, newId: () => string) {
  if (!/^9900\d{4}$/.test(patientId) || !hash.startsWith("#mcp=")) return null;
  const payload = decodePayload(hash.slice(5));
  return draftsFromAi({ orders: payload.orders, not_understood: [] }, newId);
}
export function useMcpReceiver(enabled: boolean | null, receive: (id: string, drafts: Draft[]) => void, newId: () => string) {
  useEffect(() => {
    if (!enabled || !window.location.hash.startsWith("#mcp=")) return;
    const id = new URLSearchParams(window.location.search).get("open") ?? "";
    try {
      const drafts = readMcpDraft(window.location.hash,id,newId);
      if (!drafts) return;
      // Clear synchronously before any state updates: Strict Mode cannot import twice.
      window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);
      receive(id,drafts);
      auditLog({role:"AI",actor:"Claude Code（MCP）",action:"Claude Code（MCP）から下書きを受け取った",detail:`${drafts.length}件`,patient:id});
    } catch {
      window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);
    }
  }, [enabled,receive,newId]);
}
