export function noteLineStyle(line: string) {
  const m = line.match(/^([ \t　]*)(☐ |☑ |[-・] |\d+\. |> |💡 |❗ )(.*)$/u);
  if (!m) return null;
  const marker = m[2];
  return { indent: m[1], marker, body: m[3], prefix: m[1].length + marker.length, kind: marker.startsWith('☐') || marker.startsWith('☑') ? 'check' : marker === '> ' ? 'quote' : marker === '💡 ' || marker === '❗ ' ? 'callout' : 'list', checked: marker.startsWith('☑') };
}
export const noteSizeKey = (name: string) => `simple-karte:note-size:${name}`;
export function readNoteSize(name: string): number {
  try { const n = Number(localStorage.getItem(noteSizeKey(name))); return [13, 16, 19].includes(n) ? n : 13; } catch { return 13; }
}

/** The box of a callout line (Notion's callout): 💡 a note, ❗ something not to miss. */
export const calloutClass = (marker: string) => (marker === "❗ " ? "rounded bg-shu-soft" : "rounded bg-ai-soft");
