import { lineLabel, linesFromFields, type StandingLine } from "./standing-lines";
import type { StandingOrders } from "./standing";

/** Plain audit text shared by the chart and the standing order history. */
export function lineChangeText(lines: StandingLine[], next: StandingLine, fmtDay: (day: number) => string = String): string {
  const old = lines.find((l) => l.id === next.changedFrom);
  return `指示を変更：${old ? lineLabel(old) : "元の指示"} → ${next.text}${old?.end?.day !== next.end?.day || old?.end?.time !== next.end?.time ? `（終了日：${old?.end ? fmtDay(old.end.day) : "変えるまで"} → ${next.end ? fmtDay(next.end.day) : "変えるまで"}）` : ""}${next.changeReason?.trim() ? `（理由：${next.changeReason.trim()}）` : ""}`;
}

export function fieldChangeText(versions: StandingOrders[], next: StandingOrders, fmtDay: (day: number) => string = (day) => day === 0 ? "今日" : `今日から${day}日`): string {
  const endings = Object.entries(next.fieldEnds ?? {}).filter(([key, e]) => JSON.stringify(versions.at(-1)?.fieldEnds?.[key]) !== JSON.stringify(e));
  if (endings.length) return endings.map(([key, e]) => `終了：${linesFromFields(versions).findLast((l) => l.id.replace(/^fld-\d+-/, "") === key)?.text ?? key} ${fmtDay(e.day)} ${e.time}${e.reason ? `（理由：${e.reason}）` : ""}`).join("／");
  const before = linesFromFields(versions).filter((l) => !l.changed && !l.stop);
  const after = linesFromFields([next]);
  const key = (l: StandingLine) => l.id.replace(/^fld-\d+-/, "");
  const differences = before.flatMap((l) => {
    const n = after.find((v) => key(v) === key(l));
    return n?.text === l.text ? [] : [`${l.text} → ${n?.text ?? "指示なし"}`];
  });
  for (const l of after) if (!before.some((v) => key(v) === key(l))) differences.push(l.text);
  return `指示を${versions.length ? "変更" : "確定"}：${differences.join("／") || "有効期間の変更"}${next.reason?.trim() ? `（理由：${next.reason.trim()}）` : ""}`;
}
