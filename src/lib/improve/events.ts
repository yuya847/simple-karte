// 「直りました」 in やること opens 最近の変更 on the top row, at the commit that fixed the request.
export const CHANGES_EVENT = "simple-karte:open-changes";
export function openChanges(sha?: string) {
  window.dispatchEvent(new CustomEvent(CHANGES_EVENT, { detail: sha }));
}
