import { ApprovalDeniedError, HelperError, UserStoppedError } from "../helper/errors.js";
import { activateWindow, getWindow, launchApp, listWindows, toWindowObject, listWindowsRaw, windowRect } from "./win32.js";
import { captureWindowPng, toDataUrl } from "./screenshot.js";
import { clickAt, dragPath, pressChord, scrollAt, typeText } from "./input.js";
import { SafetyOverlay } from "./overlay.js";
import { actOnElement, dumpTree, formatTree } from "./uia.js";

function publicWindow(w) {
  const { _rect, _pid, _exe, ...pub } = w;
  return pub;
}

function appId(exe) {
  return `process:${exe}`;
}

function displayName(exe) {
  const base = String(exe || "").split(/[/\\]/).pop() || exe;
  return base || "unknown";
}

/**
 * Native Windows backend: no Codex, no helper exe.
 * Implements the same `call(method, params)` surface the MCP tools expect.
 * Screenshots are foreground crops (no occluded capture like WGC).
 * Accessibility tree is not yet implemented (V1 uses screenshots + coordinates).
 */
export class NativeClient {
  #approvals;
  #originByWindow = new Map();
  #uiaByWindow = new Map();
  #overlay = new SafetyOverlay();
  #stopped = false;
  constructor({ approvals }) {
    this.#approvals = approvals;
    this.#overlay.onStop = () => this.markStoppedByUser();
  }

  markStoppedByUser() {
    this.#stopped = true;
  }

  async close() {
    this.#overlay.hide();
  }

  async call(method, params = {}) {
    switch (method) {
      case "list_apps": return this.#listApps();
      case "list_windows": return this.#listWindows();
      case "get_window": return publicWindow(await getWindow(params.id, params.app));
      case "launch_app": await launchApp(params.app); return {};
      case "activate_window": await this.#ensureApproved(params.window); await activateWindow(params.window); return {};
      case "get_window_state": return this.#windowState(params);
      case "click": return this.#click(params);
      case "type_text": return this.#typeText(params);
      case "press_key": return this.#pressKey(params);
      case "scroll": return this.#scroll(params);
      case "drag": return this.#drag(params);
      case "click_element": return this.#clickElement(params);
      case "set_value": return this.#setValue(params);
      case "perform_secondary_action": return this.#secondaryAction(params);
      case "close": return {};
      case "diagnostic_state": return { backend: "native", occludedCapture: "printwindow", uia: true };
      default: throw new HelperError(method, `unknown method "${method}"`);
    }
  }

  async #listWindows() {
    return (await listWindows()).map(publicWindow);
  }

  async #listApps() {
    const raw = await listWindowsRaw();
    const byExe = new Map();
    for (const r of raw) {
      const exe = r.exe || r.pname || "unknown";
      if (!byExe.has(exe)) byExe.set(exe, []);
      byExe.get(exe).push(toWindowObject(r));
    }
    return [...byExe.entries()].map(([exe, windows]) => ({
      id: appId(exe),
      displayName: displayName(exe),
      windows: windows.map(publicWindow),
    }));
  }

  #approvalKey(window) {
    // Keep the same shape as before: approval key is the exe basename ("explorer.exe"),
    // while window.app is "process:<full path>".
    const full = window?.app ?? "";
    const m = /^process:(.*)$/.exec(full);
    const exe = m ? m[1] : full;
    const base = exe.split(/[/\\]/).pop() || exe;
    const key = (base || full).toLowerCase();
    return { key, display: displayName(exe) };
  }

  async #ensureApproved(window) {
    await this.#resumeIfStopped();
    const { key, display } = this.#approvalKey(window);
    await this.#approvals.ensureApproved({
      app: key,
      displayName: display,
      riskLevel: "low",
      allowPersistentApproval: true,
    });
    await this.#overlay.poke();
  }

  async #resumeIfStopped() {
    if (!this.#stopped) return;
    if (!(await this.#approvals.confirmResume())) throw new UserStoppedError();
    this.#stopped = false;
  }

  async #windowState({ window, include_screenshot = true, include_text = false }) {
    await this.#ensureApproved(window);
    const fresh = await getWindow(window.id, window.app).catch(() => window);
    const result = { window: publicWindow(fresh) };
    if (include_screenshot) {
      const shot = await captureWindowPng(fresh._rect ? fresh : { ...fresh, id: fresh.id });
      this.#originByWindow.set(fresh.id, shot.origin);
      result.screenshots = [{
        id: "screenshot-0",
        url: toDataUrl(shot.mimeType, shot.data),
        width: shot.logicalWidth,
        height: shot.logicalHeight,
        originX: shot.origin.x,
        originY: shot.origin.y,
        zIndex: 0,
      }];
    } else {
      result.screenshots = [];
    }
    if (include_text) {
      try {
        const dump = await dumpTree(fresh.id);
        this.#uiaByWindow.set(fresh.id, dump.tree);
        result.accessibility = {
          tree: formatTree(dump.tree),
          focused_element: dump.focused ? `Focused: ${dump.focused}` : "",
          selected_text: "",
          selected_elements: [],
          document_text: "",
        };
      } catch (e) {
        result.accessibility = {
          tree: `(UIA dump failed: ${e.message} — use screenshot coordinates)`,
          focused_element: "",
          selected_text: "",
          selected_elements: [],
          document_text: "",
        };
      }
    }
    return result;
  }

  async #elementRuntime(windowId, element_index) {
    let elements = this.#uiaByWindow.get(windowId);
    if (!elements) {
      const dump = await dumpTree(windowId);
      elements = dump.tree;
      this.#uiaByWindow.set(windowId, elements);
    }
    const el = elements.find((e) => e.index === Number(element_index));
    if (!el) throw new HelperError("element", `element_index ${element_index} is not part of the latest observation. Observe again with include_text=true.`);
    return el.runtimeId;
  }

  async #clickElement({ window, element_index }) {
    const w = await this.#resolveWindow(window);
    await this.#ensureApproved(w);
    const runtimeId = await this.#elementRuntime(w.id, element_index);
    await activateWindow(w);
    await actOnElement(w.id, runtimeId, "invoke");
    return {};
  }

  async #setValue({ window, element_index, value }) {
    const w = await this.#resolveWindow(window);
    await this.#ensureApproved(w);
    const runtimeId = await this.#elementRuntime(w.id, element_index);
    await activateWindow(w);
    await actOnElement(w.id, runtimeId, "setvalue", { value });
    return {};
  }

  async #secondaryAction({ window, element_index, action }) {
    const w = await this.#resolveWindow(window);
    await this.#ensureApproved(w);
    const runtimeId = await this.#elementRuntime(w.id, element_index);
    await activateWindow(w);
    await actOnElement(w.id, runtimeId, "secondary", { action });
    return {};
  }

  #toScreen(window, x, y) {
    const origin = this.#originByWindow.get(window.id);
    if (origin) return { x: origin.x + x, y: origin.y + y };
    const r = window._rect;
    if (!r) throw new HelperError("click", "window rect unknown. Call get_window_state first.");
    return { x: r.left + x, y: r.top + y };
  }

  async #resolveWindow(window) {
    const fresh = await getWindow(window.id, window.app).catch(() => window);
    if (!fresh._rect) {
      const rect = await windowRect(fresh.id);
      fresh._rect = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }
    return fresh;
  }

  async #click({ window, x, y, click_count = 1, mouse_button = "left" }) {
    const w = await this.#resolveWindow(window);
    await this.#ensureApproved(w);
    if (x == null || y == null) throw new HelperError("click", "native click needs x and y (element_index is not supported in V1).");
    await activateWindow(w);
    await new Promise((r) => setTimeout(r, 250));
    const p = this.#toScreen(w, x, y);
    await clickAt(p.x, p.y, { clickCount: click_count, button: mouse_button });
    return {};
  }

  async #typeText({ window, text }) {
    const w = await this.#resolveWindow(window);
    await this.#ensureApproved(w);
    await activateWindow(w);
    await new Promise((r) => setTimeout(r, 250));
    await typeText(text);
    return {};
  }

  async #pressKey({ window, key }) {
    const w = await this.#resolveWindow(window);
    await this.#ensureApproved(w);
    await activateWindow(w);
    await new Promise((r) => setTimeout(r, 250));
    await pressChord(key);
    return {};
  }

  async #scroll({ window, x, y, scrollX = 0, scrollY = 0, scroll_x = 0, scroll_y = 0 }) {
    const w = await this.#resolveWindow(window);
    await this.#ensureApproved(w);
    await activateWindow(w);
    await new Promise((r) => setTimeout(r, 250));
    const p = this.#toScreen(w, x ?? 100, y ?? 100);
    await scrollAt(p.x, p.y, scrollX || scroll_x, scrollY || scroll_y);
    return {};
  }

  async #drag({ window, from_x, from_y, to_x, to_y }) {
    const w = await this.#resolveWindow(window);
    await this.#ensureApproved(w);
    await activateWindow(w);
    await new Promise((r) => setTimeout(r, 250));
    const a = this.#toScreen(w, from_x, from_y);
    const b = this.#toScreen(w, to_x, to_y);
    await dragPath(a.x, a.y, b.x, b.y);
    return {};
  }
}
