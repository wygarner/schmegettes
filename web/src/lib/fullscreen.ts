// Keeps the browser toolbar hidden. Browsers only allow fullscreen from a user
// gesture, so each tap or key press while not fullscreen asks for it again.
// An installed app (manifest display "fullscreen"/"standalone") skips this.
// iPhone Safari has no element fullscreen; there the home-screen install is the path.

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
