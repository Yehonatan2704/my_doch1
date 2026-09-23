// The calendar keeps its multi-day selection until a report for it is saved (DESIGN §7.3).
// The report screen is a separate route, so it signals a save through this flag; the calendar
// clears its selection when it regains focus and sees it.
let savedAt = 0;

export function markSelectionSaved() {
  savedAt = Date.now();
}

/** True once per save: returns whether a save happened since `since`. */
export function selectionSavedSince(since: number): boolean {
  return savedAt > since;
}
