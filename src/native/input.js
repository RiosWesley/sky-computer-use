import { keyboard, mouse, Button, Key } from "@nut-tree-fork/nut-js";

mouse.config.autoDelayMs = 50;
keyboard.config.autoDelayMs = 20;

const ALIAS = { ctrl: "Control_L", alt: "Alt_L", shift: "Shift_L" };

// X keysym-style names used by the MCP tools -> nut-js Key
const KEYMAP = {
  Return: Key.Enter,
  Tab: Key.Tab,
  Escape: Key.Escape,
  BackSpace: Key.Backspace,
  Delete: Key.Delete,
  Insert: Key.Insert,
  Home: Key.Home,
  End: Key.End,
  Up: Key.Up,
  Down: Key.Down,
  Left: Key.Left,
  Right: Key.Right,
  Page_Up: Key.PageUp,
  Page_Down: Key.PageDown,
  space: Key.Space,
  period: Key.Period,
  comma: Key.Comma,
  minus: Key.Minus,
  equal: Key.Equal,
  slash: Key.Slash,
  backslash: Key.Backslash,
  bracketleft: Key.LeftBracket,
  bracketright: Key.RightBracket,
  semicolon: Key.Semicolon,
  apostrophe: Key.Quote,
  grave: Key.Grave,
  F1: Key.F1, F2: Key.F2, F3: Key.F3, F4: Key.F4, F5: Key.F5, F6: Key.F6,
  F7: Key.F7, F8: Key.F8, F9: Key.F9, F10: Key.F10, F11: Key.F11, F12: Key.F12,
};

for (const c of "abcdefghijklmnopqrstuvwxyz0123456789") {
  KEYMAP[c] = Key[c.toUpperCase()];
  KEYMAP[c.toUpperCase()] = Key[c.toUpperCase()];
}
for (let i = 0; i <= 9; i++) KEYMAP[`KP_${i}`] = Key[`Num${i}`];

const MODIFIERS = new Map([
  ["Control_L", Key.LeftControl], ["Control_R", Key.RightControl], ["Ctrl", Key.LeftControl],
  ["Alt_L", Key.LeftAlt], ["Alt_R", Key.RightAlt], ["Alt", Key.LeftAlt],
  ["Shift_L", Key.LeftShift], ["Shift_R", Key.RightShift], ["Shift", Key.LeftShift],
]);

export function parseChord(key) {
  return String(key)
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ALIAS[p] ?? p);
}

export function chordToKeys(parts) {
  if (parts.length === 1) {
    const single = parts[0];
    if (MODIFIERS.has(single)) return { mods: [MODIFIERS.get(single)], main: null };
    const k = KEYMAP[single];
    if (k == null) throw new Error(`unknown key "${single}". Use letters, Return, Tab, Escape, BackSpace, arrows, F1-F12, KP_0-9.`);
    return { mods: [], main: k };
  }
  const mods = [];
  for (const p of parts.slice(0, -1)) {
    const m = MODIFIERS.get(p);
    if (!m && m !== 0) throw new Error(`"${p}" is not a modifier. Use Control_L/Control_R, Alt_L/Alt_R, Shift_L/Shift_R (+Ctrl/Alt/Shift aliases).`);
    mods.push(m);
  }
  const last = parts[parts.length - 1];
  const main = KEYMAP[last];
  if (main == null) throw new Error(`unknown key "${last}" at the end of chord "${parts.join("+")}".`);
  return { mods, main };
}

export async function clickAt(screenX, screenY, { clickCount = 1, button = "left" } = {}) {
  await mouse.move([{ x: Math.round(screenX), y: Math.round(screenY) }]);
  const btn = button === "right" ? Button.RIGHT : button === "middle" ? Button.MIDDLE : Button.LEFT;
  for (let i = 0; i < Math.min(3, Math.max(1, clickCount)); i++) await mouse.click(btn);
}

export async function typeText(text) {
  await keyboard.type(String(text));
}

export async function pressChord(key) {
  const { mods, main } = chordToKeys(parseChord(key));
  if (main == null) {
    await keyboard.pressKey(mods[0]);
    await keyboard.releaseKey(mods[0]);
    return;
  }
  for (const m of mods) await keyboard.pressKey(m);
  await keyboard.pressKey(main);
  await keyboard.releaseKey(main);
  for (const m of [...mods].reverse()) await keyboard.releaseKey(m);
}

export async function scrollAt(screenX, screenY, dx, dy) {
  await mouse.move([{ x: Math.round(screenX), y: Math.round(screenY) }]);
  // nut-js scroll: positive y scrolls up in its convention; align with docs (positive scroll_y = down)
  const steps = Math.round((dy || 0) / 100) || (dy ? Math.sign(dy) : 0);
  const xSteps = Math.round((dx || 0) / 100) || (dx ? Math.sign(dx) : 0);
  if (xSteps) await mouse.scrollRight(xSteps);
  if (steps) {
    if (steps > 0) await mouse.scrollDown(steps);
    else await mouse.scrollUp(-steps);
  }
}

export async function dragPath(fromX, fromY, toX, toY) {
  await mouse.move([{ x: Math.round(fromX), y: Math.round(fromY) }]);
  await mouse.pressButton(Button.LEFT);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(fromX + ((toX - fromX) * i) / steps);
    const y = Math.round(fromY + ((toY - fromY) * i) / steps);
    await mouse.move([{ x, y }]);
  }
  await mouse.releaseButton(Button.LEFT);
}
