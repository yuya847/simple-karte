import { fillTemplate, isInput, parseTemplate, startValues, type TemplateFacts } from "./note-templates";

/** The dictionary and template picker share the same parser, defaults and chart substitutions. */
export function preparePhrase(body: string, facts: TemplateFacts) {
  const parsed = parseTemplate(body);
  const values = startValues(parsed, facts);
  return { parsed, values, needsForm: parsed.fields.some(isInput) || parsed.errors.some(e => !e.includes("不明な予約語")), text: fillTemplate(parsed, values, facts) };
}
