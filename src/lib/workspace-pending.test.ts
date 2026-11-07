import { afterEach, expect, it, vi } from "vitest";
import { readPending, writePending, clearPending } from "./workspace-pending";
afterEach(()=>vi.unstubAllGlobals());
it("端末保存が拒否されても入力を妨げず、不正な記録は復元しない",()=>{
  vi.stubGlobal("window",{location:{search:""},get localStorage(){throw new Error("blocked");}});
  expect(()=>writePending("ws","day",{notes:{}},null)).not.toThrow();
  expect(()=>clearPending("ws","day")).not.toThrow();
  expect(readPending("ws","day")).toBeNull();
  vi.stubGlobal("window",{location:{search:""},localStorage:{getItem:()=>'{"data":[]}'}});
  expect(readPending("ws","day")).toBeNull();
});
it("保存待ちは病棟・保存先・日付ごとに分ける",()=>{
  const values=new Map<string,string>();
  const win={location:{search:"?scenarios=100"},localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}};
  vi.stubGlobal("window",win);
  writePending("a","today",{notes:{p:[]}},null);
  expect(readPending("b","today")).toBeNull();expect(readPending("a","tomorrow")).toBeNull();
  win.location.search="";expect(readPending("a","today")).toBeNull();
  win.location.search="?scenarios=100";expect(readPending("a","today")?.data).toEqual({notes:{p:[]}});
  clearPending("a","today");expect(readPending("a","today")).toBeNull();
});
