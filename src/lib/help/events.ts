// Department buttons and the top row open the same help panel.
export const HELP_EVENT = "simple-karte:open-help";
export function openHelp(section?: string) {
  window.dispatchEvent(new CustomEvent(HELP_EVENT, { detail: section }));
}
