// E2E mode: the Playwright suite (e2e/) plays a real game with narration finishing at once and
// answers "spoken" as typed text. Rules: docs/system-docs/engineering/testing-strategy.md.
//
// Only the Vite dev server and a staging build (VITE_ENV=staging, set by deploy.yml) can turn it
// on. Both values are replaced at build time, so in any other build e2eAllowed() is the constant
// false and the E2E code is dropped from the bundle (web's CI job checks that `__e2e` is absent).

/** Whether this build may run in E2E mode at all. */
export function e2eAllowed(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ENV === "staging";
}

let active = false;

/** True once installE2E() has run in this tab. */
export function e2eActive(): boolean {
  return e2eAllowed() && active;
}

export function setE2EActive(on: boolean): void {
  active = on;
}

declare global {
  interface ImportMetaEnv {
    /** "staging" or "production", set by deploy.yml; unset locally. */
    readonly VITE_ENV?: string;
  }
}
