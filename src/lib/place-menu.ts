// The ways back to the ward's menu (「病棟で開く画面を選ぶ」) from a ward screen: the first row of the
// place pulldown, the last choice of a ward tab's ⌄, and the ＋ of the screens row (a new tab).

import type { Area } from "./nav";

/** The 病棟 row of the place pulldown: it opens the ward's menu, and says so. */
export const WARD_MENU_LABEL = "病棟のメニュー（画面を選ぶ）";

/** What a place is called in the pulldown. */
export const placeLabel = (a: Area): string => (a.key === "ward" ? WARD_MENU_LABEL : a.label);

/** Places with people's work (部署) and the hospital's shared pages (そのほか); tools stay out, but チャット is a place. */
const DEPT_PAGES = ["or", "dialysis", "pharmacy", "lab", "liaison", "receipt"];
export function placeMenuRows(areas: Area[]): { depts: Area[]; shared: Area[] } {
  const places = areas.filter((a) => !a.tool || a.key === "chat");
  const depts = places.filter((a) => a.kind !== "page" || DEPT_PAGES.includes(a.key));
  return { depts, shared: places.filter((a) => !depts.includes(a)) };
}

/** The last choice of a ward tab's ⌄: back to the menu (its key is the menu's). */
export const WARD_MENU_OPTION = { key: "menu", label: "画面を選ぶ（メニュー）…", group: "病棟のメニュー" } as const;

/** The ＋ at the end of the ward's screens: the menu in a new tab. */
export const WARD_SCREENS_PLUS = { label: "画面を選ぶ", title: "画面を選ぶ（メニューを新しいタブで）" } as const;
