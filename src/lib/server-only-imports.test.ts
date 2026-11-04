// 本番ビルドが落ちる典型を手元で見つける: a "use client" file (or anything it pulls in) must not import, as a
// value, a module that reads the file system (src/lib/masters/server.ts and everything that imports it).
// Turbopack then fails with "does not support external modules (request: node:fs)" — in the browser and in
// the Vercel build. Type-only imports are fine (they are erased).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Value imports of a file (type-only ones left out), resolved to files under src when they are ours. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(?!type\s)[^;'"]*?\s+from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
  for (const m of src.matchAll(re)) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    if (spec === "node:fs" || spec === "fs" || spec === "node:fs/promises" || spec === "fs/promises") {
      out.push("node:fs");
      continue;
    }
    let target: string | null = null;
    if (spec.startsWith("@/")) target = join(ROOT, spec.slice(2));
    else if (spec.startsWith(".")) target = resolve(dirname(file), spec);
    if (!target) continue;
    for (const cand of [target, `${target}.ts`, `${target}.tsx`, join(target, "index.ts"), join(target, "index.tsx")]) {
      try {
        if (statSync(cand).isFile()) {
          out.push(cand);
          break;
        }
      } catch {
        // not this one
      }
    }
  }
  return out;
}

describe("画面はサーバー専用のモジュールを値として読まない（本番ビルドが落ちる）", () => {
  const files = walk(ROOT).filter((f) => !f.includes("/app/api/") && !f.endsWith("/masters/server.ts"));
  const graph = new Map<string, string[]>(files.map((f) => [f, importsOf(f)]));
  // Server-only: imports node:fs itself, or (transitively) a module that does.
  const serverOnly = new Set<string>();
  const seen = new Map<string, boolean>();
  const isServerOnly = (f: string, stack: string[] = []): boolean => {
    if (seen.has(f)) return seen.get(f)!;
    if (stack.includes(f)) return false;
    const deps = graph.get(f) ?? importsOf(f);
    const yes = deps.includes("node:fs") || f.endsWith("/masters/server.ts") || deps.some((d) => d !== "node:fs" && isServerOnly(d, [...stack, f]));
    seen.set(f, yes);
    if (yes) serverOnly.add(f);
    return yes;
  };
  for (const f of files) isServerOnly(f);

  it("the client components and their imports stay clear of fs-reading modules", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (!/^\s*["']use client["']/m.test(src)) continue;
      for (const d of graph.get(f) ?? []) {
        if (d !== "node:fs" && serverOnly.has(d)) offenders.push(`${relative(ROOT, f)} → ${relative(ROOT, d)}`);
      }
    }
    expect(offenders, "値として import している画面のファイル → サーバー専用のモジュール（import type にするか、API 経由にする）").toEqual([]);
  });

  it("knows the fs-reading modules (sanity)", () => {
    expect([...serverOnly].some((f) => f.endsWith("/billing/engine.ts"))).toBe(true);
  });
});
