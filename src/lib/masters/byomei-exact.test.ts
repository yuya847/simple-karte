import { describe, expect, it } from "vitest";
import { exactDisease } from "./byomei";
describe("自動登録の完全一致検索", () => {
  it("マスターの完全名に一致する", () => expect(exactDisease("誤嚥性肺炎").disease?.code).toBe("5070003"));
  it("部位・疑いをマスターの修飾語として取り出す", () => {
    const r = exactDisease("右下腿蜂巣炎の疑い");
    expect(r.disease?.name).toBe("下腿蜂巣炎");
    expect(r.prefixes).toContainEqual(expect.objectContaining({code:"2056",name:"右"}));
    expect(r.suffixes).toContainEqual(expect.objectContaining({code:"8002"}));
  });
  it("部分一致や読みだけでは登録しない", () => {
    expect(exactDisease("誤嚥性").disease).toBeNull();
    expect(exactDisease("ごえんせいはいえん").disease).toBeNull();
  });
});
