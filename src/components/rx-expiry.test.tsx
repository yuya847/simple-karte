import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { RxExpiryNotice } from "./RxExpiryNotice";
import { RxExpiryStrip } from "./RxExpiryStrip";
import { RxExpiryInbox } from "./RxExpiryInbox";
import { PATIENTS } from "@/lib/patients";
import { expiryInbox } from "@/lib/rx-expiry-workflow";
import type { OrderEntry } from "@/lib/types";
const today = { y: 2026, m: 11, d: 6 };
const patient = { ...PATIENTS[0], ward: "5階東" };
const entry: OrderEntry = { kind: "order", id: "rx-expiry-test", day: -1, time: "09:00", author: patient.attending, status: "有効", order: { type: "prescription", category: "定期", drugCode: "ORAL-AMLO5", amount: 1, unit: "錠", timings: ["朝"], start: { day: -1 }, days: 3 } };
function button(node: ReactNode): { onClick: () => void; disabled?: boolean } | undefined {
  if (Array.isArray(node)) return node.map(button).find(Boolean);
  if (!isValidElement<{ children?: ReactNode; onClick: () => void; disabled?: boolean }>(node)) return;
  if (node.type === "button") return node.props;
  return button(node.props.children);
}
it.each(["薬剤師 小林", "看護師 佐藤"])("%sの伝達ボタンから主治医の患者別一覧へ届く", sender => {
  const onSend = vi.fn();
  const props = { people: [{ patient, entries: [entry] }], today, sender, stickies: {}, onSend };
  const view = RxExpiryNotice(props);
  button(view)!.onClick();
  expect(onSend).toHaveBeenCalledOnce();
  const [pid, sticky] = onSend.mock.calls[0];
  expect(pid).toBe(patient.id);
  const stickies = { [pid]: [sticky] };
  expect(button(RxExpiryNotice({ ...props, stickies }))!.disabled).toBe(true);
  const inbox = expiryInbox(props.people, today, stickies, () => true);
  const html = renderToStaticMarkup(<RxExpiryInbox inbox={inbox} onOpen={() => {}} onClose={() => {}} />);
  expect(html).toContain(sender);
  expect(html).toContain("明日で切れます");
});
it("カルテの1行に薬剤数と終了日を表示する", () => {
  const html = renderToStaticMarkup(<RxExpiryStrip patient={patient} entries={[entry]} today={today} doctor sender="医師" stickies={[]} onSticky={() => {}} onRemove={() => {}} onExtend={() => {}} pending={{}} />);
  expect(html).toContain("内服 1剤が明日で切れます");
});
