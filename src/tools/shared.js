import { z } from "zod";

export const windowSchema = z
  .object({
    app: z.string().min(1).describe("App id of the window, copied verbatim."),
    id: z.number().int().nonnegative().describe("Window id, copied verbatim."),
    title: z.string().optional(),
  })
  .describe("A window object exactly as returned by list_apps, list_windows, get_window or get_window_state.");

export const observeSchema = z
  .enum(["none", "screenshot", "text", "both"])
  .default("screenshot")
  .describe(
    "Fresh observation to return right after the action (same as calling get_window_state). " +
      "Use 'none' only when chaining keystrokes you will verify in the next call.",
  );

export const screenshotIdSchema = z
  .string()
  .optional()
  .describe("screenshot_id of the image the coordinates were read from. Required when the last observation had several.");

export function textResult(text) {
  return { content: [{ type: "text", text }] };
}

export function jsonResult(value) {
  return textResult(JSON.stringify(value));
}

/** Converts thrown errors into MCP tool errors so Claude sees the helper's message verbatim. */
export function withErrors(handler) {
  return async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
    }
  };
}
