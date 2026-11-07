/** Keep consumed drafts out even when an older workspace snapshot is merged back in. */
export function pendingChartDrafts<T extends { id: string }>(drafts: T[], confirmed: string[] = []): T[] {
  const ids = new Set(confirmed);
  return drafts.filter(d => !ids.has(d.id));
}
