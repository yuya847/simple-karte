import { FLOORS, nurseFor } from "../ward";
import type { Patient } from "../types";

/** Fill existing rooms without mixing sexes in a shared room, including historical stays. */
export function assignRooms(cases: { patient: Patient; bed: string }[]) {
  for (const floor of FLOORS) {
    const people = cases.filter((c) => c.patient.ward === floor.name);
    const men = people.filter((c) => c.patient.sex === "男");
    const women = people.filter((c) => c.patient.sex === "女");
    const shared = floor.rooms.filter((r) => r.beds.length === 4);
    const singles = floor.rooms.filter((r) => r.beds.length === 1);
    const maleRooms = Math.min(shared.length, Math.floor(men.length / 4));
    const femaleRooms = Math.min(shared.length - maleRooms, Math.floor(women.length / 4));
    const place = (c: typeof people[number], room: string, bed: string) => {
      c.patient.room = room;
      c.bed = bed;
      c.patient.history = c.patient.history.map((e) => e.kind === "note" && e.role === "看護師" ? { ...e, author: nurseFor(room) } : e);
    };
    for (const [group, rooms] of [[men, shared.slice(0, maleRooms)], [women, shared.slice(maleRooms, maleRooms + femaleRooms)]] as const) {
      for (const room of rooms) for (const bed of room.beds) place(group.shift()!, room.no, bed);
    }
    const remaining = [...men, ...women];
    if (remaining.length > singles.length) throw new Error(`病床が足りません：${floor.name}`);
    remaining.forEach((c, i) => place(c, singles[i].no, singles[i].beds[0]));
  }
}
