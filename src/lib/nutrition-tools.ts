/** Reorder existing tools without changing permissions or introducing another shared group key. */
export function nutritionTools<T extends {key:string;title:string;main:U[];more:U[]},U extends {key:string}>(groups:T[]): T[] {
 const keys=["nutrition","guide-record","diet"];
 const tools=groups.flatMap(g=>[...g.main,...g.more]);
 const first=groups.find(g=>g.key==="intervention");
 if (!first) return groups;
 return [ {...first,title:"栄養",main:keys.flatMap(k=>tools.filter(t=>t.key===k)),more:[...first.main,...first.more].filter(t=>!keys.includes(t.key))}, ...groups.filter(g=>g!==first).map(g=>({...g,main:g.main.filter(t=>!keys.includes(t.key)),more:g.more.filter(t=>!keys.includes(t.key))})) ];
}
