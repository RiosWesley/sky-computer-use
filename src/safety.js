// Windows-key chords open the Start menu, Run dialog, etc. Codex's policy forbids them; enforce it here too.
const WINDOWS_KEY = /^(?:[lr]?win|windows|meta|super|cmd|command|os)(?:_?[lr])?$/i;

/** Normalizes a `+`-separated chord and rejects any part that maps to the Windows key. */
export function assertSafeKeyChord(key) {
  const parts = String(key)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error("key is required");

  const blocked = parts.find((part) => WINDOWS_KEY.test(part));
  if (blocked != null) {
    throw new Error(`Key "${blocked}" is blocked: Computer Use must not press the Windows key or its shortcuts.`);
  }
  return parts.join("+");
}
