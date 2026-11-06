import { rehabPrescriptions, THERAPISTS, type RehabDesk } from "./rehab";
import type { WorkPatient } from "./worksheet";

/** Keep authored bookings only when both the patient and prescription belong to this ward. */
export function wardRehabDesk(desk: RehabDesk, people: WorkPatient[]): RehabDesk {
  const rxs = rehabPrescriptions(people);
  const valid = (x: { patientId: string; orderId: string }) => rxs.some(r => r.patientId === x.patientId && r.orderId === x.orderId);
  return { ...desk, bookings: desk.bookings.filter(valid), sessions: desk.sessions.filter(valid) };
}

/** Initial bookings for the test ward use its own prescriptions. */
export function scenarioRehabBookings(people: WorkPatient[]): RehabDesk["bookings"] {
  return rehabPrescriptions(people).slice(0, 12).map((r, i) => ({
    id: `rb-scenario-${r.orderId}`, patientId: r.patientId, orderId: r.orderId,
    therapist: THERAPISTS[0].name, discipline: "PT", day: 0,
    start: `${String(9 + Math.floor(i * 40 / 60)).padStart(2, "0")}:${String(i * 40 % 60).padStart(2, "0")}`,
    minutes: 40, place: "訓練室", by: THERAPISTS[0].name,
  }));
}

export function initialScenarioRehabDesk(people: WorkPatient[]): RehabDesk {
  const bookings = scenarioRehabBookings(people);
  const sessions: RehabDesk["sessions"] = rehabPrescriptions(people).filter(r => r.startDay + 1 < 0).map(r => ({
    id: `rs-scenario-${r.orderId}`, orderId: r.orderId, patientId: r.patientId,
    therapist: THERAPISTS[0].name, discipline: "PT", day: r.startDay + 1,
    arrived: { day: r.startDay + 1, time: "10:00", by: THERAPISTS[0].name },
    start: "10:00", end: "10:40", place: "病棟（ベッドサイド）", content: "端座位保持・移乗練習。介助量と訓練後の反応を確認。",
    recordedAt: { day: r.startDay + 1, time: "10:45", by: THERAPISTS[0].name },
  }));
  return { bookings, sessions, bi: [], plans: [], nine: {} };
}

/** Repair saves made before the test ward had its own bookings, retaining its recorded work. */
export function restoreScenarioRehabDesk(saved: RehabDesk, people: WorkPatient[]): RehabDesk {
  const own = wardRehabDesk(saved, people);
  const initial = initialScenarioRehabDesk(people);
  return {
    ...own,
    bookings: own.bookings.length ? own.bookings : initial.bookings,
    sessions: [...initial.sessions.filter(s => !own.sessions.some(x => x.id === s.id)), ...own.sessions],
  };
}
