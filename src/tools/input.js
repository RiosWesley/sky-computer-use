import { z } from "zod";
import { assertSafeKeyChord } from "../safety.js";
import { observeSchema, screenshotIdSchema, windowSchema, withErrors } from "./shared.js";

const elementIndexSchema = z
  .number()
  .int()
  .nonnegative()
  .describe("Element index from the accessibility tree of the latest observation.");

/** Tools that send input to a window. Each one can return a fresh observation in the same call. */
export function registerInputTools(server, { client, observer, registry }) {
  const act = async (window, observe, method, params, summary) => {
    await client.call(method, { window, ...params });
    const done = { type: "text", text: `${summary} done.` };
    if (observe === "none") return { content: [done] };
    try {
      return { content: [done, ...(await observer.observe(window, observe))] };
    } catch (error) {
      return { content: [done, { type: "text", text: `Observation after the action failed: ${error.message}` }] };
    }
  };

  // Translates coordinates read off a (possibly downscaled) screenshot into helper coordinates.
  const toHelperPoints = (window, screenshotId, points) => {
    const converter = registry.resolve(window.id, screenshotId);
    if (converter == null) return { points, screenshotId };
    return { points: points.map(converter.toHelper), screenshotId: converter.screenshotId };
  };
  const withScreenshot = (screenshotId) => (screenshotId == null ? {} : { screenshotId });

  server.registerTool(
    "click",
    {
      title: "Click",
      description:
        "Click an element by element_index (preferred when the accessibility tree has it) or a point x,y in " +
        "pixels of a screenshot from the latest observation.",
      inputSchema: {
        window: windowSchema,
        element_index: elementIndexSchema.optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        screenshot_id: screenshotIdSchema,
        click_count: z.number().int().min(1).max(3).default(1),
        mouse_button: z.enum(["left", "right", "middle"]).default("left"),
        observe: observeSchema,
      },
    },
    withErrors(async ({ window, element_index, x, y, screenshot_id, click_count, mouse_button, observe }) => {
      if (element_index != null) {
        return act(window, observe, "click_element", { element_index, click_count, mouse_button }, "click");
      }
      if (x == null || y == null) throw new Error("click needs element_index or both x and y.");
      const { points, screenshotId } = toHelperPoints(window, screenshot_id, [x, y]);
      const params = { x: points[0], y: points[1], click_count, mouse_button, ...withScreenshot(screenshotId) };
      return act(window, observe, "click", params, "click");
    }),
  );

  server.registerTool(
    "type_text",
    {
      title: "Type text",
      description:
        "Type literal text into the focused control. Verify focus first; use press_key for Enter, Tab, arrows " +
        "and shortcuts instead of control characters.",
      inputSchema: { window: windowSchema, text: z.string(), observe: observeSchema },
    },
    withErrors(({ window, text, observe }) => act(window, observe, "type_text", { text }, "type_text")),
  );

  server.registerTool(
    "press_key",
    {
      title: "Press key",
      description:
        "Press a key or '+'-separated chord using X keysym-style names: a, space, Return, Tab, Escape, " +
        "BackSpace, Up, Control_L+a, Control_L+Shift_L+period, KP_0, F5. Aliases Ctrl, Alt, Shift work. " +
        "The Windows key is blocked.",
      inputSchema: { window: windowSchema, key: z.string().min(1), observe: observeSchema },
    },
    withErrors(({ window, key, observe }) =>
      act(window, observe, "press_key", { key: assertSafeKeyChord(key) }, `press_key ${key}`),
    ),
  );

  server.registerTool(
    "scroll",
    {
      title: "Scroll",
      description:
        "Scroll from a point (pixels of a screenshot from the latest observation). Positive scroll_y scrolls " +
        "down, negative up; positive scroll_x scrolls right. ~600 is about one screen.",
      inputSchema: {
        window: windowSchema,
        x: z.number(),
        y: z.number(),
        scroll_x: z.number().default(0),
        scroll_y: z.number().default(0),
        screenshot_id: screenshotIdSchema,
        observe: observeSchema,
      },
    },
    withErrors(async ({ window, x, y, scroll_x, scroll_y, screenshot_id, observe }) => {
      const { points, screenshotId } = toHelperPoints(window, screenshot_id, [x, y]);
      const params = { x: points[0], y: points[1], scrollX: scroll_x, scrollY: scroll_y, ...withScreenshot(screenshotId) };
      return act(window, observe, "scroll", params, "scroll");
    }),
  );

  server.registerTool(
    "drag",
    {
      title: "Drag",
      description: "Drag between two points (pixels of a screenshot from the latest observation).",
      inputSchema: {
        window: windowSchema,
        from_x: z.number(),
        from_y: z.number(),
        to_x: z.number(),
        to_y: z.number(),
        screenshot_id: screenshotIdSchema,
        observe: observeSchema,
      },
    },
    withErrors(async ({ window, from_x, from_y, to_x, to_y, screenshot_id, observe }) => {
      const { points, screenshotId } = toHelperPoints(window, screenshot_id, [from_x, from_y, to_x, to_y]);
      const [fx, fy, tx, ty] = points;
      const params = { from_x: fx, from_y: fy, to_x: tx, to_y: ty, ...withScreenshot(screenshotId) };
      return act(window, observe, "drag", params, "drag");
    }),
  );

  server.registerTool(
    "set_value",
    {
      title: "Set value",
      description: "Replace the value of an editable element (marked 'settable' in the accessibility tree).",
      inputSchema: { window: windowSchema, element_index: elementIndexSchema, value: z.string(), observe: observeSchema },
    },
    withErrors(({ window, element_index, value, observe }) =>
      act(window, observe, "set_value", { element_index, value }, "set_value"),
    ),
  );

  server.registerTool(
    "perform_secondary_action",
    {
      title: "Secondary action",
      description:
        "Invoke an accessibility action listed for an element, such as Expand, Collapse, Raise, Scroll Up or " +
        "Scroll Down (case-insensitive).",
      inputSchema: {
        window: windowSchema,
        element_index: elementIndexSchema,
        action: z.string().min(1),
        observe: observeSchema,
      },
    },
    withErrors(({ window, element_index, action, observe }) =>
      act(window, observe, "perform_secondary_action", { element_index, action }, `secondary action ${action}`),
    ),
  );
}
