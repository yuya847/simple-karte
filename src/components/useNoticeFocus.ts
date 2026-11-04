"use client";

import { useEffect, useState } from "react";
import { NOTICE_FOCUS_EVENT, NOTICE_HIGHLIGHT_MS, noticePatientIndex, type NoticeDestination } from "@/lib/notice-focus";

/** A new request also runs when navigation keeps the current screen. */
export function useNoticeFocus() {
  const [request, setRequest] = useState<{ patientId: string; destination: NoticeDestination } | null>(null);
  useEffect(() => {
    if (!request) return;
    window.dispatchEvent(new CustomEvent(NOTICE_FOCUS_EVENT, { detail: request.destination }));
    let highlighted: HTMLElement | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-patient][data-notice-destination]"));
      const index = noticePatientIndex(rows.map((row) => ({ patient: row.dataset.patient, destination: row.dataset.noticeDestination })), request.patientId, request.destination);
      highlighted = rows[index];
      if (!highlighted) return;
      highlighted.scrollIntoView({ block: "center", behavior: "smooth" });
      highlighted.classList.add("notice-patient-highlight");
      timer = setTimeout(() => highlighted?.classList.remove("notice-patient-highlight"), NOTICE_HIGHLIGHT_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      highlighted?.classList.remove("notice-patient-highlight");
    };
  }, [request]);
  return (patientId: string, destination: NoticeDestination) => setRequest({ patientId, destination });
}
