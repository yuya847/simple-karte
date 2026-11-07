"use client";

// 病名管理番号 and 病名交換用コード for the FHIR Condition: asked of the server, where the official 傷病名マスター is.

import { useEffect, useState } from "react";
import type { Diagnosis } from "@/lib/diagnoses";
import type { DiseaseKeys } from "@/lib/national/clins";

export function useDiseaseKeys(diagnoses: Diagnosis[]): { keys: DiseaseKeys; note: string } {
  const [keys, setKeys] = useState<DiseaseKeys>({});
  const [note, setNote] = useState("");
  const codes = diagnoses.map((d) => d.code).join(",");
  useEffect(() => {
    if (!codes) return;
    let live = true;
    fetch(`/api/byomei?keys=${codes}`)
      .then((r) => r.json())
      .then((j: { keys: DiseaseKeys }) => live && setKeys(j.keys))
      .catch(() => live && setNote("傷病名マスターに問い合わせられなかったので、病名管理番号は「99999999」（コード化できない）のままです。"));
    return () => {
      live = false;
    };
  }, [codes]);
  return { keys, note };
}
