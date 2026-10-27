// The name this device used last, to prefill the next name prompt. Browser storage can be
// missing or blocked (private windows, previews), so every access is guarded.
const KEY = "schmegettes.displayName";

export const MAX_NAME = 20;

export function cleanName(name: string): string {
  return name.trim();
}

export function isValidName(name: string): boolean {
  const n = cleanName(name).length;
  return n >= 1 && n <= MAX_NAME;
}

export function getLastName(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setLastName(name: string): void {
  try {
    window.localStorage.setItem(KEY, cleanName(name));
  } catch {
    // Not remembering a name is fine.
  }
}
