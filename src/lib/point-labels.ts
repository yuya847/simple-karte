/**
 * Which numbers on a row of the flow sheet keep their text. Marks are in time order (x in px, centred);
 * a number that would touch the next one shown becomes a dot, so the newer number stays readable.
 */
export function labelsThatFit(marks: { at: number; text: string }[], gap = 3): boolean[] {
  const width = (s: string) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 10 : 6), 0);
  const keep = marks.map(() => false);
  let edge = Infinity;
  for (let i = marks.length - 1; i >= 0; i--) {
    const w = width(marks[i].text);
    if (marks[i].at + w / 2 + gap <= edge) {
      keep[i] = true;
      edge = marks[i].at - w / 2;
    }
  }
  return keep;
}
