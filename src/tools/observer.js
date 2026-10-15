import { prepareScreenshot } from "../screenshots/images.js";

const OBSERVE_FLAGS = {
  screenshot: { include_screenshot: true, include_text: false },
  text: { include_screenshot: false, include_text: true },
  both: { include_screenshot: true, include_text: true },
};

/**
 * Captures a window (screenshots and/or accessibility text) and renders it as MCP content.
 * Shared by get_window_state and by every input tool's `observe` option.
 */
export class Observer {
  #client;
  #registry;
  #imageOptions;

  constructor({ client, registry, imageOptions }) {
    this.#client = client;
    this.#registry = registry;
    this.#imageOptions = imageOptions;
  }

  /** @param {"screenshot" | "text" | "both"} mode */
  async observe(window, mode) {
    const state = await this.#client.call("get_window_state", { window, ...OBSERVE_FLAGS[mode] });
    const shots = await Promise.all((state.screenshots ?? []).map((shot) => prepareScreenshot(shot, this.#imageOptions)));
    const observedWindow = state.window ?? window;
    this.#registry.remember(observedWindow.id, shots);
    return [summaryBlock(observedWindow, shots), ...shots.flatMap(imageBlocks), ...accessibilityBlocks(state.accessibility)];
  }
}

function summaryBlock(window, shots) {
  const summary = {
    window,
    screenshots: shots.map((shot) => ({
      screenshot_id: shot.id,
      z_index: shot.zIndex,
      image_size: `${shot.image.width}x${shot.image.height}`,
    })),
  };
  return { type: "text", text: JSON.stringify(summary) };
}

function imageBlocks(shot) {
  return [
    { type: "text", text: `screenshot_id=${shot.id} (coordinates are pixels of this image)` },
    { type: "image", data: shot.image.data.toString("base64"), mimeType: shot.image.mimeType },
  ];
}

function accessibilityBlocks(accessibility) {
  if (accessibility == null) return [];
  const sections = [
    ["Focused element", accessibility.focused_element],
    ["Selected text", accessibility.selected_text],
    ["Selected elements", accessibility.selected_elements?.join("\n")],
    ["Document text", accessibility.document_text],
    ["Accessibility tree (element indexes are valid only for this observation)", accessibility.tree],
  ];
  const text = sections
    .filter(([, value]) => typeof value === "string" && value !== "")
    .map(([title, value]) => `## ${title}\n${value}`)
    .join("\n\n");
  return text === "" ? [] : [{ type: "text", text }];
}
