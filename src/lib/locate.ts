/**
 * "Use my location", with every way it can end accounted for.
 *
 * `getCurrentPosition` answers through one of two callbacks, except when it doesn't: Firefox
 * calls neither when its permission prompt is closed without a choice ("Not now", Escape, a
 * click elsewhere), and the `timeout` option only starts counting once permission is
 * given. A page that waits for a callback then says "Locating..." until it is reloaded.
 * So the wait has a limit of its own, after which the page is told the browser has not
 * answered. A late answer still counts: someone may simply be reading the prompt.
 */

/** Why no position came. */
export type LocateFailure =
  /** There is no geolocation in this browser, or not on this (insecure) page. */
  | "unsupported"
  /** The user, or a browser or site policy, refused. */
  | "denied"
  /** Permission was given and no fix could be had in time. */
  | "unavailable"
  /** The browser has not answered at all. */
  | "unanswered";

export interface LocateHandlers {
  position(latitudeDeg: number, longitudeDeg: number): void;
  /** May be followed by `position` when the reason is "unanswered" and the answer then comes. */
  failed(reason: LocateFailure): void;
}

export interface LocateOptions {
  /** How long to wait for the browser to say anything, in ms. */
  patienceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const LOCATE_FAILURE_TEXT: Record<LocateFailure, string> = {
  unsupported: "This browser has no location service here. Pick a city or type the coordinates.",
  denied: "Location permission was refused. Pick a city or type the coordinates.",
  unavailable: "The browser could not find a location. Pick a city or type the coordinates.",
  unanswered:
    "No answer from the browser yet. If it is asking for permission, answer it there; or pick a city or type the coordinates.",
};

/** The slice of the Geolocation API this uses, so a test can stand in for it. */
export interface PositionSource {
  getCurrentPosition(
    success: (position: { coords: { latitude: number; longitude: number } }) => void,
    error: (error: { code: number }) => void,
    options?: { timeout?: number; maximumAge?: number },
  ): void;
}

const PERMISSION_DENIED = 1;

export function locate(source: PositionSource | undefined, handlers: LocateHandlers, options: LocateOptions = {}): void {
  if (!source) {
    handlers.failed("unsupported");
    return;
  }
  const { patienceMs = 20_000 } = options;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let answered = false;
  const watchdog = setTimer(() => {
    if (!answered) handlers.failed("unanswered");
  }, patienceMs);
  const answer = (): boolean => {
    if (answered) return false; // a browser that calls back twice is answered once
    answered = true;
    clearTimer(watchdog);
    return true;
  };
  source.getCurrentPosition(
    (position) => {
      if (answer()) handlers.position(position.coords.latitude, position.coords.longitude);
    },
    (error) => {
      if (answer()) handlers.failed(error.code === PERMISSION_DENIED ? "denied" : "unavailable");
    },
    // A fix from the last ten minutes will do for a sundial; give up on a new one after 15 s.
    { timeout: 15_000, maximumAge: 600_000 },
  );
}
