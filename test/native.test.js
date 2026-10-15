import assert from "node:assert/strict";
import { test } from "node:test";
import { chordToKeys, parseChord } from "../src/native/input.js";
import { loadConfig } from "../src/config.js";

test("parses chords with Ctrl/Alt/Shift aliases", () => {
  assert.deepEqual(parseChord(" Ctrl+a "), ["Ctrl", "a"]);
  const { mods, main } = chordToKeys(parseChord("Control_L+Shift_L+period"));
  assert.equal(mods.length, 2);
  assert.ok(main);
});

test("maps Return/Escape/KP digits", () => {
  assert.notEqual(chordToKeys(parseChord("Return")).main, null);
  assert.notEqual(chordToKeys(parseChord("Escape")).main, null);
  assert.notEqual(chordToKeys(parseChord("KP_0")).main, null);
  assert.throws(() => chordToKeys(parseChord("Win+r")), /not a modifier|unknown key/);
});

test("native config has no Codex paths", () => {
  const cfg = loadConfig({ SKY_APPROVALS_PATH: "x.json" });
  assert.equal(cfg.approvalsPath, "x.json");
  assert.ok(!("helperPath" in cfg));
  assert.ok(!("codexCliPath" in cfg));
});
