import { isDividerLine } from "@/lib/note-blocks";
import { Fragment } from "react";
import { markLines, type MarkPart } from "@/lib/note-marks";

const part = (p: MarkPart, i: number) =>
  p.kind === "text" ? (
    <Fragment key={i}>{p.text}</Fragment>
  ) : p.kind === "b" ? (
    <b key={i}>{p.text}</b>
  ) : p.kind === "i" ? (
    <i key={i}>{p.text}</i>
  ) : (
    <b key={i}>
      <i>{p.text}</i>
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
      {markLines(text).map((l, i) => (
        <Fragment key={i}>
          {i > 0 && "\n"}
          {isDividerLine(lines[i]) ? <span role="separator" className="my-2 block border-t border-rule" /> : l.heading ? <b className="text-ink" data-problem-parent={l.parentPath}>{l.parts.map(part)}</b> : l.parts.map(part)}
        </Fragment>
      ))}
    </>
  );
}
