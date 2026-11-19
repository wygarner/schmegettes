// Keeps the browser toolbar hidden. Browsers only allow fullscreen from a user
// gesture, so each tap or key press while not fullscreen asks for it again.
// An installed app (manifest display "fullscreen"/"standalone") skips this.
// iPhone and iPad Safari have no element fullscreen: there the Home Screen app is the only
// way, so the host lobby shows a tip (needsHomeScreenTip, ui/HomeScreenTip.tsx).

function installed(win: Window): boolean {
  return ["fullscreen", "standalone"].some((mode) => win.matchMedia?.(`(display-mode: ${mode})`).matches);
}

export function enforceFullscreen(win: Window = window): void {
  const doc = win.document;
  if (!doc.fullscreenEnabled || installed(win)) return;

  const request = () => {
    if (doc.fullscreenElement) return;
    doc.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {
      // Refused (no gesture, iframe, user setting): try again on the next one.
    });
  };
  win.addEventListener("pointerup", request);
  win.addEventListener("keyup", request);
}

/**
 * True on iPhone/iPad Safari when the page isn't the Home Screen app: the only browser where
 * the toolbar can't be hidden from the page. Chrome, Firefox and Edge on iOS can't add to the
 * Home Screen the same way, so they get no tip.
 */
export function needsHomeScreenTip(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  const ua = nav.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  if (!ios || /CriOS|FxiOS|EdgiOS/.test(ua)) return false;
  return nav.standalone !== true && !installed(win);
}
