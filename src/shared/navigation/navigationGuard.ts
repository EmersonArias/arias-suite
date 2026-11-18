export const SUITE_NAVIGATION_EVENT = 'arias:before-navigate'
export function canNavigateInSuite() {
  return window.dispatchEvent(new Event(SUITE_NAVIGATION_EVENT, { cancelable: true }))
}
