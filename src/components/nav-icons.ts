import {
  Ambulance,
  ArrowRightLeft,
  BedDouble,
  BookOpen,
  BriefcaseMedical,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  FlaskConical,
  LayoutGrid,
  List,
  Megaphone,
  MessagesSquare,
  Pill,
  Printer,
  Scissors,
  ScrollText,
  Stethoscope,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-react";
import type { AreaKey, WardTab } from "@/lib/nav";

export type Icon = typeof Pill;

export const AREA_ICON: Record<AreaKey, Icon> = {
  ward: BedDouble,
  er: Ambulance,
  opd: Stethoscope,
  or: Scissors,
  dialysis: Droplets,
  pharmacy: Pill,
  lab: FlaskConical,
  board: Megaphone,
  manual: BookOpen,
  incident: TriangleAlert,
  chat: MessagesSquare,
  audit: ScrollText,
};

export const WARD_ICON: Record<WardTab, Icon> = {
  map: LayoutGrid,
  floor: Building2,
  mine: UserRound,
  dept: Users,
  all: List,
  doctor: BriefcaseMedical,
  sheet: Printer,
  handoff: ArrowRightLeft,
  admit: ClipboardList,
  acuity: ClipboardCheck,
};
