import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSafeKeyChord } from "../src/safety.js";

test("blocks every spelling of the Windows key", () => {
  for (const chord of ["Win+r", "Super_L", "Meta+d", "LWin", "windows_r+e", "Cmd+Space", "Control_L+OS"]) {
    assert.throws(() => assertSafeKeyChord(chord), /blocked/, chord);
  }
});

test("allows ordinary keys and chords, normalizing whitespace", () => {
  assert.equal(assertSafeKeyChord(" Control_L + Shift_L + period "), "Control_L+Shift_L+period");
  for (const chord of ["Return", "Alt+F4", "KP_0", "Escape", "osx"]) {
    assert.doesNotThrow(() => assertSafeKeyChord(chord), chord);
  }
});
