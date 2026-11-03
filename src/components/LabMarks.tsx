import type { Place } from "@/lib/results";

/** Where the sample comes from: the room on the ward, or a 救急 / 外来 mark for a visit. */
export function PlaceMark({ place, room }: { place: Place; room: string }) {
  if (place === "病棟") return <span className="nums text-ink-faint">{room}</span>;
  return <span className={`rounded border px-1 text-[10px] font-bold ${place === "救急" ? "border-shu/60 text-shu" : "border-fuji/60 text-fuji"}`}>{place}</span>;
}
