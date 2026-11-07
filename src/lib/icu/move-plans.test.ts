import { expect, it } from "vitest";
import { moveBedPlans } from "./move-plans";
import { floorCounts } from "../bed-control";
import { FLOORS } from "../ward";
import { icuPatient } from "./test-fixture";
import type { OrderEntry } from "../types";
it("明日のHCU転出を1床、行き先への転入を1床として数える", () => {
  const p={...icuPatient,ward:"HCU",room:"HCU4"};
  const entry:OrderEntry={kind:"order",id:"m",day:0,time:"09:00",author:"架空医師",status:"有効",order:{type:"procedure",code:"PROC-MOVE",start:{day:1,time:"10:00"},schedule:{kind:"once"},move:{kind:"転棟",to:{room:"501",bed:""},reason:"架空"}}};
  const plans=moveBedPlans([p],{[p.id]:[entry]});
  expect(plans).toEqual([{floor:"HCU",day:1,kind:"退院",transfer:true},{floor:"5階東病棟",day:1,kind:"入院",transfer:true}]);
  const counts=floorCounts(FLOORS,[{room:"HCU4",bed:"",patientId:p.id}],()=>p,plans);
  expect(counts.find(c=>c.floor==="HCU")).toMatchObject({discharge:[0,1],tomorrowEmpty:8});
  expect(moveBedPlans([p],{[p.id]:[{...entry,status:"中止"}]})).toEqual([]);
  expect(moveBedPlans([p],{})).toEqual([]);
});
