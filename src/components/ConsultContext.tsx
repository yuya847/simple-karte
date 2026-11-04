"use client";
import { createContext, useContext } from "react";
import { consultState, type ConsultReplies } from "@/lib/consult";
export const ConsultContext = createContext<ConsultReplies>({});
export function ConsultStatus({ id }: {
    id: string;
}) { const replies = useContext(ConsultContext); return <span className="ml-2 text-ai">{consultState(replies[id])}</span>; }
