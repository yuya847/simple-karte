import type { Dish, ServedDish } from "./kitchen";
import type { DysphagiaCode, Thickness } from "./diet";

/** Authored kitchen fixtures: these are recipes, not a classification of arbitrary dishes. */
export function dysphagiaDishes(dishes: Dish[], code: DysphagiaCode | undefined, thickness?: Thickness): ServedDish[] {
  const jelly = (name:string,id:string):ServedDish => ({id,name,role:"副菜",kcal:60,protein:0,salt:0,contains:[],items:[["ゼリー用調整粉",10]]});
  if (code === "0j") return [jelly("嚥下訓練用ゼリー","training-jelly")];
  if (code === "0t") return [{...jelly(`嚥下訓練用とろみ水（${thickness ?? "中間のとろみ"}）`,"training-water"),kcal:8,items:[["とろみ調整粉",2]]}];
  if (code === "1j") return [{...jelly("栄養補助ムース","nutrition-mousse"),kcal:150,protein:6,contains:["乳"],items:[["栄養補助ムース",100]]}];
  return dishes.filter(d => d.role !== "汁物" && !/漬け|漬物|納豆/.test(d.name)).flatMap(d => {
    if (d.id === "milk" || d.id === "juice") return [{...d,id:`${d.id}-thick`,name:`${d.name}（${thickness ?? "中間のとろみ"}）`,items:[...d.items,["とろみ調整粉",2] as [string,number]]}];
    if (d.id === "yogurt") return [{...d,name:d.name}];
    const form = code === "2-1" ? "均質ペースト" : code === "2-2" ? "やわらかい粒のペースト" : code === "3" ? "舌でつぶせるやわらか煮" : "歯ぐきでつぶせるやわらか煮";
    return [{...d,id:`${d.id}-${code}`,name:`${d.name}（${form}）`,kcal:Math.round(d.kcal*0.85),protein:Math.round(d.protein*0.85*10)/10,salt:Math.round(d.salt*0.9*10)/10}];
  });
}
