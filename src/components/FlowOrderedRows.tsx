"use client";
import { Children, isValidElement, type ReactNode } from "react";
import type { FlowLayout } from "@/lib/flow-layout";
export function FlowRow({ children }: { id: string; children: ReactNode }) { return children; }
export function FlowOrderedRows({ layout, children }: { layout: FlowLayout; children: ReactNode }) {
  const rows = Children.toArray(children);
  const order = layout.rowOrder ?? [];
  const rank = (node: ReactNode, i: number) => {
    const id = isValidElement<{ id?: string }>(node) ? node.props.id : undefined;
    const n = id ? order.indexOf(id) : -1;
    return n < 0 ? order.length + i : n;
  };
  return rows.map((node, i) => ({ node, rank: rank(node, i) })).sort((a, b) => a.rank - b.rank).map(x => x.node);
}
