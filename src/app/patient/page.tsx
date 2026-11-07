import type { Metadata } from "next";
import { PatientPortal } from "@/components/portal/PatientPortal";

export const metadata: Metadata = {
  title: "患者さんのページ",
  robots: { index: false, follow: false },
};

export default function PatientPage() {
  return <PatientPortal />;
}
