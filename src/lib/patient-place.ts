/** Initial emergency ids are er-◯; visit charts also use er:◯ / opd:◯. Admission creates a new ward id. */
export function patientPlace(id: string): "ward" | "er" | "opd" {
  if (id.startsWith("er:") || id.startsWith("er-")) return "er";
  return id.startsWith("opd:") ? "opd" : "ward";
}
