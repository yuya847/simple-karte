import { calloutClass, noteLineStyle } from "@/lib/note-style";
import { displayText } from "@/lib/display-text";
import { isDividerLine } from "@/lib/note-blocks";
import { Fragment } from "react";
import { markLines, type MarkPart } from "@/lib/note-marks";

const part = (p: MarkPart, i: number) =>
  p.kind === "text" ? (
    <Fragment key={i}>{displayText(p.text)}</Fragment>
  ) : p.kind === "b" ? (
    <b key={i}>{displayText(p.text)}</b>
  ) : p.kind === "i" ? (
    <i key={i}>{displayText(p.text)}</i>
  ) : (
    <b key={i}>
      <i>{displayText(p.text)}</i>
    </b>
  );

/**
 * A note's text for reading: **…** bold, *…* italic, "#1 …" lines as headings. Put inside an element with
 * whitespace-pre-wrap (the line breaks are kept as "\n").
 */
export function NoteText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {markLines(text).map((l, i) => { const style = noteLineStyle(lines[i]); return (
        <Fragment key={i}>
          {i > 0 && "\n"}
          {isDividerLine(lines[i]) ? <span role="separator" className="my-2 block border-t border-rule" /> : style ? <span className={`${style.checked ? "text-ink-faint line-through" : ""} ${style.kind === "quote" ? "border-l-2 border-rule pl-3 text-ink-soft" : ""} ${style.kind === "callout" ? `${calloutClass(style.marker)} my-0.5 block px-2 py-1` : ""}`} style={{ marginLeft: `${style.indent.length * .5}em` }}>{style.kind === "check" ? <input type="checkbox" checked={style.checked} readOnly tabIndex={-1} aria-label={style.checked ? "チェック済み" : "未チェック"} className="mr-2 accent-ai" /> : style.kind === "list" ? style.marker === "- " ? "・ " : style.marker : null}{markLines(style.body)[0].parts.map(part)}</span> : l.heading ? <b className="text-ink" data-problem-parent={l.parentPath}>{l.parts.map(part)}</b> : l.parts.map(part)}
        </Fragment>
      ); })}
    </>
  );
}
