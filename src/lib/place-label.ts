import { floorOf } from "./ward";
export function roomLabel(room: string, bed = ""): string { return `${room.replace(/号室$/, "").replace(/-([A-D])$/, "$1")}${bed}`; }
export function wardLabel(room: string): string { return floorOf(room.replace(/[-]?[A-D]$/, "")); }
