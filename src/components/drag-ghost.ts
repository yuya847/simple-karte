// What is shown at the pointer while records of the 経過 are carried to the right (Do): the card itself (a copy, a
// little narrower), or up to three of the chosen cards stacked, with 「N件」 when more than one.

/** A copy of the cards, put out of sight, for DataTransfer.setDragImage; remove it right after (setTimeout 0). */
export function dragGhost(cards: HTMLElement[], count: number): HTMLElement {
  const ghost = document.createElement("div");
  const width = Math.min(340, Math.max(200, ...cards.map((c) => c.offsetWidth)));
  ghost.style.cssText = `position:fixed;top:-2000px;left:-2000px;width:${width + 16}px;padding-top:6px;pointer-events:none`;
  cards.slice(0, 3).forEach((c, i) => {
    const copy = c.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));
    copy.style.cssText = `position:${i ? "absolute" : "relative"};top:${i ? 6 + i * 6 : 0}px;left:${i * 6}px;width:${width}px;max-height:150px;overflow:hidden;opacity:1;background:var(--color-sheet);border-radius:6px;box-shadow:0 6px 18px -6px rgba(38,34,28,0.45);z-index:${3 - i}`;
    ghost.appendChild(copy);
  });
  if (count > 1) {
    const badge = document.createElement("span");
    badge.textContent = `${count}件`;
    badge.style.cssText = "position:absolute;top:0;right:0;z-index:5;border-radius:999px;background:var(--color-ai);color:#fff;font-size:12px;font-weight:700;line-height:18px;padding:0 8px";
    ghost.appendChild(badge);
  }
  document.body.appendChild(ghost);
  return ghost;
}
