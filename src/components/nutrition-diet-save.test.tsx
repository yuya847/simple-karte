import { isValidElement, type ReactNode, type ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
const h=vi.hoisted(()=>({slots:[] as unknown[],cursor:0}));
vi.mock("react",async importOriginal=>({ ...await importOriginal<typeof import("react")>(),
 useState:(initial:unknown)=>{const i=h.cursor++;if(!(i in h.slots)) h.slots[i]=typeof initial === "function" ? initial() : initial;return [h.slots[i],(v:unknown)=>{h.slots[i]=typeof v === "function" ? v(h.slots[i]) : v;}];},
 useEffect:()=>{},useRef:(value:unknown)=>({current:value})
}));
vi.mock("./RoleContext",()=>({useMe:()=>({role:"管理栄養士",name:"管理栄養士 高橋"})}));
import { DietWindow } from "./DietWindow";
import { DietPanel } from "./panels/DietPanel";
import { PATIENTS } from "@/lib/patients";
import type { DietOrder } from "@/lib/diet";
function elements(node:ReactNode): ReactElement<Record<string,unknown>>[] {
 if(Array.isArray(node)) return node.flatMap(elements);
 if(!isValidElement<Record<string,unknown>>(node)) return [];
 return [node,...elements(node.props.children as ReactNode)];
}
beforeEach(()=>{h.cursor=0;h.slots=[];});
it("主治医への提案を送った後に、フォームを閉じても完了表示が残る",()=>{
 const onDraft=vi.fn();
 const props:ComponentProps<typeof DietWindow>={patient:PATIENTS[0],entries:[],diets:[],today:{y:2026,m:11,d:7},nowTime:"06:00",dietEdit:{doctor:"医師",denied:null,onDraft}};
 const render=()=>{h.cursor=0;return elements(DietWindow(props));};
 let tree=render();
 const button=tree.find(e=>e.type==="button" && e.props.children==="新しい食事オーダ")!;
 (button.props.onClick as ()=>void)();tree=render();
 const panel=tree.find(e=>e.type===DietPanel)!;
 const order:DietOrder={id:"d",patientId:props.patient.id,kind:"嚥下調整食",dysphagia:"2-1",energyKcal:1400,from:{day:0,meal:"昼"},at:{day:0,time:"06:00"},by:"管理栄養士 高橋"};
 (panel.props.onSave as (d:DietOrder)=>void)(order);
 expect(onDraft).toHaveBeenCalledOnce();
 tree=render();
 expect(tree.some(e=>e.type===DietPanel)).toBe(false);
 expect(tree.find(e=>e.props.role==="status")?.props.children).toBe("主治医の下書きに入れました");
});
