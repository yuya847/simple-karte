import { describe, expect, it } from "vitest";
import { claudeCommand, isClaudeLine, removeClaudeLine } from "./claude-command";

describe("記事の Claude コマンド", () => {
  it.each(["/claude 指示", "／claude 指示", "/Claude 指示", "/CLAUDE　 指示  "])("指示だけを取り出す: %s", line => {
    expect(claudeCommand(line)).toBe("指示");
  });
  it.each(["/claude", "/claude ", "/claudex 指示", "文 /claude 指示", " /claude 指示", "/claude 指示\n別の文"])("普通の文や空指示は送らない: %s", line => {
    expect(claudeCommand(line)).toBeNull();
  });
  it("入力途中も札にする", () => {
    expect(isClaudeLine("／Claude ")).toBe(true);
    expect(isClaudeLine("/claudex")).toBe(false);
  });
  it("先頭・途中・末尾・唯一の行を消し、周囲を保つ", () => {
    expect(removeClaudeLine("命令\n後", 0)).toBe("後");
    expect(removeClaudeLine("前\n命令\n後", 1)).toBe("前\n後");
    expect(removeClaudeLine("前\n命令", 1)).toBe("前");
    expect(removeClaudeLine("命令", 0)).toBe("");
  });
});
