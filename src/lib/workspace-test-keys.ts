import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
// Read the actual registrations, including every spread hook. Adding a state automatically adds cases.
export function registeredKeys() {
  const keys: string[] = [];
  for (const file of ["../components/WardApp.tsx", ...readdirSync(new URL(".", import.meta.url)).filter(f => /^use-.*\.ts$/.test(f) && !f.endsWith(".test.ts")).map(f => `./${f}`)]) {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const walk = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && ts.isArrayLiteralExpression(node.initializer) && node.initializer.elements.length === 2 && ts.isIdentifier(node.name)) {
        const parent = node.parent;
        let owner: ts.Node = parent;
        while (ts.isAsExpression(owner.parent) || ts.isParenthesizedExpression(owner.parent)) owner = owner.parent;
        if (ts.isObjectLiteralExpression(parent) && ((ts.isCallExpression(owner.parent) && owner.parent.expression.getText(source) === "useWorkspace") || (ts.isPropertyAssignment(owner.parent) && owner.parent.name.getText(source) === "states"))) keys.push(node.name.text);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  }
  return [...new Set(keys)].filter(k => k !== "__writer");
}
