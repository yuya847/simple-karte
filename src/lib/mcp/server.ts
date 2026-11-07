import { z } from "zod";
import { generateScenarios } from "../scenarios";
import { DRUGS, ORAL_DRUGS, LAB_TESTS } from "../master";
import { PROCEDURES, PROC_DRUGS } from "../procedures";
import { activeOrders } from "../active-orders";
import { egfr } from "../exams";
import { renalFunction } from "../abx-renal";
import { orderLines } from "../format";
import { todayInTokyo } from "../dates";
import { AiWireOrder } from "../ai-schema";
import { pseudonym, scrub } from "./anonymize";
import { encodePayload, parseProposal, proposal } from "./payload";

const data = generateScenarios();
export const fixtures = data;
export const resolvePatient = (id: string) => data.cases.find(c => pseudonym(c.patient.id) === id);
const listInput = z.object({ diagnosis: z.string().max(100).optional(), department: z.string().max(100).optional(), status: z.enum(["入院中", "外来", "入院", "救急", "退院"]).optional() });
const patientInput = z.object({ patient: proposal.shape.patient });
const masterInput = z.object({ kind: z.enum(["drug", "oral", "injection", "topical", "lab", "procedure"]), query: z.string().min(1).max(100) });
const schemas = { list_patients: listInput, get_patient: patientInput, search_master: masterInput, propose_orders: proposal };
const descriptions = {
  list_patients: "固定の架空の100人の現在状態。病名・科・入院中/外来で絞り込み。保存記録は読みません。",
  get_patient: "仮IDで匿名化した現在のカルテを読む。日付は相対、年齢は年代。",
  search_master: "内服・注射・外用薬、検査、処置のマスターから名前・別名・コードを検索。",
  propose_orders: "医師が確認する下書きのみ作る。確定しない。orders は AiOrder または AiWireOrder。未指定値は wire では空文字/0/unspecified。医師が述べた内容を入力する。",
};
export function toolsList() {
  return Object.entries(schemas).map(([name,schema]) => ({ name, description: descriptions[name as keyof typeof descriptions], inputSchema: name === "propose_orders" ? { ...z.toJSONSchema(proposal), properties: { patient: z.toJSONSchema(proposal.shape.patient), orders: { type: "array", minItems: 1, maxItems: 30, items: z.toJSONSchema(AiWireOrder) } } } : z.toJSONSchema(schema) }));
}
export function callTool(name: string, args: unknown, origin: string): unknown {
  if (name === "list_patients") {
    const a = listInput.parse(args);
    return data.cases.filter(c => (!a.diagnosis || c.patient.admissionDiagnosis.includes(a.diagnosis)) && (!a.department || c.patient.department.includes(a.department)) && (!a.status || c.stage === (a.status === "入院中" ? "入院" : a.status))).map(c => scrub(summary(c), data.patients));
  }
  if (name === "get_patient") {
    const c = resolvePatient(patientInput.parse(args).patient);
    if (!c) throw new Error("仮IDが見つかりません");
    const p = c.patient;
    const labs = p.labs.filter(v => v.day <= 0).sort((a,b) => b.day-a.day || b.time.localeCompare(a.time));
    const cre = labs.find(v => v.values.CRE !== undefined)?.values.CRE ?? labs.find(v => v.values.Cre !== undefined)?.values.Cre ?? null;
    return scrub({ ...summary(c), problems: c.diagnoses.map(d => d.name), allergies: p.allergies, weightKg: p.weightKg, renal: { ...renalFunction(p.age,p.sex,p.weightKg,cre), egfr: cre && p.age >= 18 ? egfr(cre,p.age,p.sex) : null }, vitals: [...p.vitals].sort((a,b) => b.day-a.day || b.time.localeCompare(a.time)).slice(0,12), latestLabs: labs[0] ?? null, labTrend: labs.slice(0,8), orders: activeOrders(p.history).filter(e => e.day <= 0 && (!("start" in e.order) || typeof e.order.start !== "object" || e.order.start.day <= 0)).map(e => ({ day: e.day, text: e.kind === "order" ? orderLines(e.order,todayInTokyo()) : null, treatmentDay: `${1-("start" in e.order && typeof e.order.start === "object" ? e.order.start.day : e.day)}日目` })), notes: p.history.filter(e => e.kind === "note" && e.day <= 0).sort((a,b) => b.day-a.day || b.time.localeCompare(a.time)).slice(0,5) }, data.patients);
  }
  if (name === "search_master") {
    const a = masterInput.parse(args), q = a.query.normalize("NFKC").toLowerCase();
    const sources = a.kind === "lab" ? LAB_TESTS : a.kind === "procedure" ? PROCEDURES : a.kind === "injection" ? DRUGS : a.kind === "oral" ? ORAL_DRUGS : a.kind === "topical" ? PROC_DRUGS : [...DRUGS,...ORAL_DRUGS,...PROC_DRUGS];
    return sources.filter(x => [x.code,x.name,...("aliases" in x ? x.aliases : [])].join(" ").normalize("NFKC").toLowerCase().includes(q)).slice(0,40).map(x => ({ code:x.code,name:x.name }));
  }
  if (name === "propose_orders") {
    const p = parseProposal(args);
    if (!resolvePatient(p.patient)) throw new Error("仮IDが見つかりません");
    const encoded = encodePayload(p);
    if (encoded.length > 60000) throw new Error("下書きが長すぎます");
    const url = `${origin}/api/mcp/open?d=${encoded}`;
    return `下書きを作りました。医師が開いて確かめ、確定してください：${url}`;
  }
  throw new Error("未知の道具です");
}
function summary(c: typeof data.cases[number]) {
  const p = c.patient;
  return { patient: pseudonym(p.id), ageBand: `${Math.floor(p.age/10)*10}代`, sex:p.sex, department:p.department, diagnosis:p.admissionDiagnosis, admissionDay:`入院${1-p.admittedOn}日目`, status:c.stage, condition:p.cautions.join("、") || "記録された注意事項なし" };
}
const rpc = z.object({ jsonrpc:z.literal("2.0"), id:z.union([z.string(),z.number(),z.null()]).optional(), method:z.string(), params:z.unknown().optional() });
export function handleRpc(value: unknown, origin: string): { status: number; body?: unknown } {
  const parsed = rpc.safeParse(value);
  if (!parsed.success) return { status:400,body:{jsonrpc:"2.0",id:null,error:{code:-32600,message:"Invalid Request"}} };
  const r = parsed.data;
  const respond = (result: unknown) => ({status:200,body:{jsonrpc:"2.0",id:r.id ?? null,result}});
  if (r.id === undefined) return {status:202};
  if (r.method === "initialize") {
    const p = z.object({protocolVersion:z.string()}).safeParse(r.params);
    const version = p.success && ["2025-11-25","2025-06-18","2025-03-26"].includes(p.data.protocolVersion) ? p.data.protocolVersion : "2025-06-18";
    return respond({protocolVersion:version,capabilities:{tools:{}},serverInfo:{name:"simple-karte",version:"1.0.0"},instructions:"架空の試験データのみ。決めるのは医師、AI は入力係。オーダは下書きです。"});
  }
  if (r.method === "ping") return respond({});
  if (r.method === "tools/list") return respond({tools:toolsList()});
  if (r.method === "tools/call") {
    const p = z.object({name:z.string(),arguments:z.unknown().optional()}).safeParse(r.params);
    if (!p.success) return {status:200,body:{jsonrpc:"2.0",id:r.id,error:{code:-32602,message:"Invalid params"}}};
    try { const result = callTool(p.data.name,p.data.arguments ?? {},origin); return respond({content:[{type:"text",text:typeof result === "string" ? result : JSON.stringify(result)}]}); }
    catch { return respond({isError:true,content:[{type:"text",text:"入力を確認してください。仮ID・道具名・下書きの形式が不正です。"}]}); }
  }
  return {status:200,body:{jsonrpc:"2.0",id:r.id,error:{code:-32601,message:"Method not found"}}};
}
