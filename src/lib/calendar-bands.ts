/** 隣り合う同じ指示の期間をまとめる。元の順序と編集可能な境界は保つ。 */
export function calendarBands<T>(cells: T[], key: (cell: T) => string): { first: T; count: number }[] {
  const bands: { first: T; count: number }[] = [];
  for (const cell of cells) {
    const last = bands.at(-1);
    if (last && key(last.first) === key(cell)) last.count++;
    else bands.push({ first: cell, count: 1 });
  }
  return bands;
}
