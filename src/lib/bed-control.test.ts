import { describe, expect, it } from "vitest";
import { bedsFor, emptyBedsOf, floorCounts } from "./bed-control";
import type { Floor } from "./ward";

const floors: Floor[] = [
  {
    name: "5階東病棟",
    rooms: [
      { no: "501", kind: "4床室", beds: ["A", "B", "C", "D"], side: "south" },
      { no: "510", kind: "個室", beds: [""], side: "north" },
      { no: "502", kind: "4床室", beds: ["A", "B", "C", "D"], side: "south" },
    ],
  },
];
const beds = [
  { room: "501", bed: "A", other: { name: "x", sex: "女" as const, age: 80, department: "内科" } },
  { room: "510", bed: "", other: { name: "y", sex: "男" as const, age: 70, department: "内科" } },
];
const none = () => undefined;

describe("ベッドコントロール", () => {
  it("counts empty beds with the sex of each room and tomorrow's forecast", () => {
    const [f] = floorCounts(floors, beds, none, [
      { floor: "5階東病棟", day: 0, kind: "退院" },
      { floor: "5階東病棟", day: 0, kind: "入院" },
      { floor: "5階東病棟", day: 0, kind: "入院" },
    ]);
    expect(f).toMatchObject({ beds: 9, occupied: 2, admit: [2, 0], discharge: [1, 0] });
    expect(f.empty).toHaveLength(7);
    expect(f.tomorrowEmpty).toBe(7 + 1 - 2);
    expect(emptyBedsOf(floors, beds, none).find((e) => e.room.no === "501")?.roomSex).toBe("女");
  });
  it("offers only beds that fit: a man not in a women's room, a 個室 for droplet precautions", () => {
    const empty = emptyBedsOf(floors, beds, none);
    const man = bedsFor({ sex: "男", roomWish: "どちらでも", isolation: "なし", ward: "5階東病棟" }, empty);
    expect(man.every((x) => x.bed.room.no !== "501")).toBe(true);
    expect(man.some((x) => x.bed.room.no === "502")).toBe(true);
    const droplet = bedsFor({ sex: "女", roomWish: "どちらでも", isolation: "飛沫予防策", ward: "5階東病棟" }, empty);
    expect(droplet).toHaveLength(0); // the only 個室 is taken
    const contact = bedsFor({ sex: "女", roomWish: "大部屋", isolation: "接触予防策", ward: "5階東病棟" }, empty);
    expect(contact[0].note).toContain("接触予防策");
  });
});
