import { AiWireOrder } from "../ai-schema";
import { z } from "zod";
// Obtain a minimal complete wire order from its documented property types.
const schema = z.toJSONSchema(AiWireOrder) as { properties: Record<string, unknown> };
function blank(s: unknown): unknown {
  const x = s as { enum?: unknown[]; type?: string; properties?: Record<string, unknown>; const?: unknown };
  if (x.enum) return x.enum.includes("") ? "" : x.enum.includes("unspecified") ? "unspecified" : x.enum[0];
  if (x.type === "object") return Object.fromEntries(Object.entries(x.properties!).map(([k,v]) => [k,blank(v)]));
  return x.type === "array" ? [] : x.type === "number" ? 0 : "";
}
export const sampleOrder = AiWireOrder.parse({ ...Object.fromEntries(Object.entries(schema.properties).map(([k,v]) => [k,blank(v)])), kind:"lab", source_text:"明日朝の採血", tests:[{code:"CRP",said:"CRP"}],collect:{day:"tomorrow",when:"morning_routine",time:"",before_dose_number:0,before_dose_drug_code:""} });
