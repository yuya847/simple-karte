// Which of the form's checks (registration.ts checkInsurance) a window shows. A fresh registration (no
// record yet) starts with an empty form: the checks that say 「◯◯を入れてください」 would all be red before
// anyone typed, so only the checks of the fields the person touched are shown until they press 登録 (or
// the answer of オンライン資格確認 is copied in). A form that edits an existing record shows every check.

import type { FormCheck, InsuranceForm } from "./registration";

export interface CheckVisibility {
  /** No record yet (the form started empty). */
  fresh: boolean;
  /** 登録 was pressed, or the form was filled from the 資格確認's answer: every check shows. */
  revealAll: boolean;
  /** The fields the person changed. */
  touched: ReadonlySet<string>;
}

export const visibleChecks = (checks: FormCheck[], v: CheckVisibility): FormCheck[] => (!v.fresh || v.revealAll ? checks : checks.filter((c) => !!c.field && v.touched.has(c.field)));

/** The fields of a patch, to add to `touched`. */
export const touchedBy = (touched: ReadonlySet<string>, patch: Partial<InsuranceForm>): Set<string> => new Set([...touched, ...Object.keys(patch)]);
