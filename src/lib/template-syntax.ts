/** Template markup is parsed as text, never as HTML. Nested fields are deliberately rejected. */
export const RESERVED_WORDS = ["サマリ", "患者ID", "氏名", "カナ", "年齢", "性別", "生年月日", "病棟", "部屋", "主治医", "主病名", "入院日", "入院日数", "今日", "今", "記載者", "職種", "身長", "体重", "BMI", "アレルギー", "直近の血液検査", "直近のバイタル", "内服", "検査:CRP"] as const;
export type ComponentType = "combo" | "list" | "radio" | "check" | "number" | "time" | "date" | "text";
export interface MarkupField { kind: "部品"; type: ComponentType; label: string; options: string[]; multiple: boolean; unit: string; defaultValue: string; required: boolean; id: string }
export interface ReservedField { kind: "予約語"; name: string }
export function readMarkup(raw: string, offset: number): MarkupField | string {
  const m = raw.match(/^<(combo|list|radio|check|number|time|date|text)\b([^>]*?)(\/?)>([\s\S]*?)(?:<\/\1\s*>)?$/);
  if (!m) return "部品のタグを確かめてください";
  const type = m[1] as ComponentType;
  const attrs: Record<string, string> = {};
  let duplicate = false;
  const rest = m[2].replace(/\s+(label|unit|default)\s*=\s*"([^"]*)"|\s+(multiple|required)\b/g, (_, key, value, flag) => { if ((key ?? flag) in attrs) duplicate = true; attrs[key ?? flag] = value ?? "true"; return ""; });
  if (duplicate) return "同じ属性を2回書けません";
  if (rest.trim()) return "属性は label・unit・default（ダブルクォート）、multiple・required が使えます";
  if (!attrs.label?.trim()) return "label に項目の名前を書いてください";
  const paired = ["combo", "list", "radio"].includes(type);
  if (paired && !raw.match(new RegExp(`</${type}\\s*>$`))) return `${type} の閉じタグがありません`;
  if (!paired && type !== "check" && !m[3]) return `${type} は /> で閉じてください`;
  const content = m[4];
  if (/[<>{}]/.test(content)) return "部品は入れ子にできません";
  const options = paired ? content.split(/[|｜]/).map(s => s.trim()).filter(Boolean) : [];
  if (paired && options.length < 2) return "選択肢を | で区切って2つ以上書いてください";
  if (!paired && content.trim()) return "この部品には本文を入れられません";
  if (attrs.multiple && type !== "list") return "multiple は list に使います";
  const def = attrs.default ?? "";
  if (def && (type === "radio" || type === "list") && def.split("|").some(v => !options.includes(v))) return "default は選択肢から選んでください";
  if (def.includes("|") && (type === "radio" || type === "list" && !attrs.multiple)) return "既定値は1つ選んでください";
  if (def && type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(def)) return "時刻の default は HH:MM で書いてください";
  if (def && type === "date") {
    const date = new Date(`${def}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(def) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== def) return "日付の default は実在する YYYY-MM-DD で書いてください";
  }
  if (def && type === "number" && !Number.isFinite(Number(def))) return "数値の default を確かめてください";
  if (def && type === "check" && !["true", "false"].includes(def)) return "チェックの default は true または false です";
  return { kind: "部品", type, label: attrs.label.trim(), options, multiple: !!attrs.multiple, unit: attrs.unit ?? "", defaultValue: def, required: !!attrs.required, id: String(offset) };
}
export const SYNTAX_TOKENS = /\{\{[^{}]*\}\}|\{[^{}\n]*\}|<(combo|list|radio)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?(?:combo|list|radio|check|number|time|date|text)\b[^>]*>|^\[\][ \t]*[^\n]*/gm;
