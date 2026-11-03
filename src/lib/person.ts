// How a patient's age and sex are written: "72歳男性". Up to 3 years old, with months: "1歳3カ月女性".

export function ageText(age: number | null | undefined, months?: number | null): string {
  if (age === null || age === undefined) return "年齢不明";
  if (age <= 3 && months !== null && months !== undefined) return `${age}歳${months}カ月`;
  return `${age}歳`;
}

export function ageSex(p: { age?: number | null; sex?: string | null; ageMonths?: number | null }): string {
  const sex = p.sex === "男" || p.sex === "女" ? `${p.sex}性` : "性別不明";
  return `${ageText(p.age, p.ageMonths)}${sex}`;
}
