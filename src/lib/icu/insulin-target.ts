import { abs } from "../flowsheet";
import type { StandingLine } from "../standing-lines";
export function insulinTarget(lines: StandingLine[], now: number) {
  for (const l of [...lines].sort((a,b)=>abs(b.at.day,b.at.time)-abs(a.at.day,a.at.time))) {
    if (abs(l.start.day,l.start.time??"00:00")>now || l.stop && abs(l.stop.day,l.stop.time)<=now || l.changed && abs(l.changed.day,l.changed.time)<=now || l.end && abs(l.end.day,l.end.time??"23:59")<now) continue;
    const m = l.text.match(/血糖[^\n]*?目標[^\d]*(\d+)\s*[〜～~−–-]\s*(\d+)/);
    if (m && Number(m[1])<Number(m[2])) return {low:Number(m[1]),high:Number(m[2]),by:l.by,at:l.at};
  }
  return null;
}
