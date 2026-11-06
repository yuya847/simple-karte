import { expect, it } from "vitest";
import { encodeWorkspace, decodeWorkspace } from "./workspace-codec";
it("初期データを送らず、変更と削除を復元し、従来の保存も読める", () => {
  const seed = { iji: { large: "x".repeat(100000) }, notes: { p: [{ id: "seed" }] }, removed: true };
  const data = { iji: seed.iji, notes: { p: [{ id: "new" }] } };
  const encoded = encodeWorkspace(data, seed);
  expect(JSON.stringify(encoded).length).toBeLessThan(200);
  expect(decodeWorkspace(encoded, seed)).toEqual(data);
  expect(decodeWorkspace(data, seed)).toEqual(data);
});

it("undefinedの任意項目もJSONを往復して削除として読める", () => {
  const seed = { entry: { id: "one", optional: "before" } };
  const wire = JSON.parse(JSON.stringify(encodeWorkspace({ entry: { id: "one", optional: undefined } }, seed)));
  expect(decodeWorkspace(wire, seed)).toEqual({ entry: { id: "one" } });
});
