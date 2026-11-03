// A simple, deformed (chibi-style) face chosen by age band and sex, so a chart is recognized at a
// glance. Drawn in SVG here; it is not a photo or a likeness of anyone.

import { useId } from "react";
import type { Sex } from "@/lib/types";

export type AgeBand = "小児" | "若年" | "中年" | "高齢" | "超高齢";

export function ageBand(age: number): AgeBand {
  if (age < 15) return "小児";
  if (age < 40) return "若年";
  if (age < 65) return "中年";
  if (age < 80) return "高齢";
  return "超高齢";
}

const SKIN = "#f4dcc8";
const HAIR: Record<AgeBand, string> = { 小児: "#3a2c25", 若年: "#3a2c25", 中年: "#4a3b33", 高齢: "#a3a3a3", 超高齢: "#dcdcdc" };
const BG: Record<AgeBand, string> = { 小児: "#fbe7c6", 若年: "#dfeee0", 中年: "#e2e8f2", 高齢: "#ece4f1", 超高齢: "#f1e8df" };

interface Props {
  sex: Sex;
  age: number;
  size?: number;
  className?: string;
}

export function PatientAvatar({ sex, age, size = 44, className = "" }: Props) {
  const band = ageBand(age);
  const hair = HAIR[band];
  const female = sex === "女";
  const old = band === "高齢" || band === "超高齢";
  const headR = band === "小児" ? 17 : 15.5;
  const id = `av${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${sex}性・${age}歳のイラスト`} className={`shrink-0 ${className}`}>
      <title>{`${sex}性・${age}歳（${band}）`}</title>
      <defs>
        <clipPath id={id}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="64" height="64" fill={BG[band]} />
        {/* long hair behind the head */}
        {female && band === "若年" && <path d="M14 31 C14 16 23 11 32 11 C41 11 50 16 50 31 L50 47 C46 44 44 40 44 35 L20 35 C20 40 18 44 14 47 Z" fill={hair} />}
        {female && band === "中年" && <path d="M15 31 C15 17 23 12 32 12 C41 12 49 17 49 31 L49 40 C46 39 45 37 45 34 L19 34 C19 37 18 39 15 40 Z" fill={hair} />}
        {female && old && <circle cx="32" cy="11" r="6.5" fill={hair} stroke={band === "超高齢" ? "#bdbdbd" : "none"} strokeWidth="0.8" />}
        {female && band === "小児" && (
          <>
            <circle cx="13.5" cy="30" r="5.5" fill={hair} />
            <circle cx="50.5" cy="30" r="5.5" fill={hair} />
          </>
        )}
        {/* gown and neck */}
        <path d="M6 64 C8 51 19 46 32 46 C45 46 56 51 58 64 Z" fill="#cddff0" />
        <path d="M26 46 L32 52 L38 46 Z" fill="#b7cde4" />
        <rect x="28" y="40" width="8" height="8" rx="2" fill={SKIN} />
        {/* head */}
        <circle cx="32" cy="30" r={headR} fill={SKIN} />
        {/* hair on top */}
        {!female && band === "小児" && <path d="M15.5 28 C15.5 17 23 12.5 32 12.5 C41 12.5 48.5 17 48.5 28 C44 22 38 20 32 21 C27 20 21 22 15.5 28 Z M30 13 C31 9 34 8 36 9 C34 10 33 11 33 13 Z" fill={hair} />}
        {!female && band === "若年" && <path d="M16.5 28 C16.5 17 23.5 13.5 32 13.5 C40.5 13.5 47.5 17 47.5 28 C45 23 41 21.5 37 21.5 C33 21.5 27 20 23 22 C20 23 18 25 16.5 28 Z" fill={hair} />}
        {!female && band === "中年" && <path d="M16.5 27 C16.5 18 23 14.5 32 14.5 C41 14.5 47.5 18 47.5 27 C45 23.5 42 22 39 22 L25 22 C22 22 19 23.5 16.5 27 Z" fill={hair} />}
        {!female && band === "中年" && (
          <>
            <path d="M16.6 27.5 C17.2 24.5 18.5 23.2 20 22.6 L19.6 27.5 Z" fill="#9a9a9a" />
            <path d="M47.4 27.5 C46.8 24.5 45.5 23.2 44 22.6 L44.4 27.5 Z" fill="#9a9a9a" />
          </>
        )}
        {!female && old && (
          <>
            <path d="M16.5 32 C16 26 17.5 22.5 20.5 21.5 L21.5 32 Z" fill={hair} />
            <path d="M47.5 32 C48 26 46.5 22.5 43.5 21.5 L42.5 32 Z" fill={hair} />
          </>
        )}
        {female && (band === "若年" || band === "中年") && <path d="M16.5 28 C17.5 19 24.5 15 32 15 C39.5 15 46.5 19 47.5 28 C43 24 38 22.5 34 24.5 C29 22 22.5 23.5 16.5 28 Z" fill={hair} />}
        {female && old && <path d="M16.5 29 C17 19 24 15.5 32 15.5 C40 15.5 47 19 47.5 29 C45 25 41 23 37 23.5 C34 22 30 22 27 23.5 C23 23 19 25 16.5 29 Z" fill={hair} />}
        {female && band === "小児" && <path d="M15.5 28 C16.5 18 24 13.5 32 13.5 C40 13.5 47.5 18 48.5 28 C44 24 39 22 35 23.5 C30 21.5 22 23 15.5 28 Z" fill={hair} />}
        {/* face */}
        <circle cx="26" cy="31" r={band === "小児" ? 2.1 : 1.8} fill="#2b2b2b" />
        <circle cx="38" cy="31" r={band === "小児" ? 2.1 : 1.8} fill="#2b2b2b" />
        {old && (
          <>
            <path d="M22 27 Q26 25.5 29 27" stroke={hair === "#dcdcdc" ? "#b5b5b5" : hair} strokeWidth="1.3" fill="none" strokeLinecap="round" />
            <path d="M35 27 Q38 25.5 42 27" stroke={hair === "#dcdcdc" ? "#b5b5b5" : hair} strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </>
        )}
        {band === "超高齢" && (
          <>
            <path d="M20.5 33 L22.5 32.5 M43.5 33 L41.5 32.5" stroke="#d2b39c" strokeWidth="0.9" strokeLinecap="round" />
            <path d="M29 39.5 Q32 40.5 35 39.5" stroke="#d2b39c" strokeWidth="0.9" fill="none" strokeLinecap="round" />
          </>
        )}
        {!female && old && (
          <g stroke="#6b6b6b" strokeWidth="1.1" fill="none">
            <circle cx="26" cy="31" r="4.2" />
            <circle cx="38" cy="31" r="4.2" />
            <path d="M30.2 31 L33.8 31" />
          </g>
        )}
        <circle cx="22.5" cy="35.5" r="2.3" fill="#f2a59c" opacity="0.55" />
        <circle cx="41.5" cy="35.5" r="2.3" fill="#f2a59c" opacity="0.55" />
        <path d="M28.5 36.5 Q32 39.5 35.5 36.5" stroke="#9a5546" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
