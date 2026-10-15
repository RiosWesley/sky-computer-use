import { z } from "zod";
import { jsonResult, textResult, windowSchema, withErrors } from "./shared.js";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

/** Tools that find, launch, focus and observe windows. */
export function registerWindowTools(server, { client, observer }) {
  server.registerTool(
    "list_apps",
    {
      title: "List apps",
      description:
        "List installed Windows apps with their open, targetable windows. Start here: pick the app and window " +
        "from this result and copy the window object verbatim into other tools.",
      inputSchema: {
        query: z.string().optional().describe("Case-insensitive filter on app id or display name."),
        running_only: z.boolean().default(false).describe("Only apps that currently have windows open."),
      },
      annotations: READ_ONLY,
    },
    withErrors(async ({ query, running_only }) => {
      const needle = query?.toLowerCase();
      const apps = (await client.call("list_apps")).filter(
        (app) =>
          (!running_only || app.windows?.length > 0) &&
          (needle == null || `${app.id} ${app.displayName ?? ""}`.toLowerCase().includes(needle)),
      );
      return jsonResult(apps);
    }),
  );

  server.registerTool(
    "list_windows",
    {
      title: "List windows",
      description: "List open windows that can be targeted, including modals and secondary windows.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    withErrors(async () => jsonResult(await client.call("list_windows"))),
  );

  server.registerTool(
    "get_window",
    {
      title: "Get window",
      description: "Re-fetch a currently open window by id (recover a lost window binding). Never invent ids.",
      inputSchema: {
        id: z.number().int().nonnegative().describe("Window id from a previously returned window."),
        app: z.string().optional().describe("App id from the same previously returned window."),
      },
      annotations: READ_ONLY,
    },
    withErrors(async ({ id, app }) => jsonResult(await client.call("get_window", app == null ? { id } : { id, app }))),
  );

  server.registerTool(
    "launch_app",
    {
      title: "Launch app",
      description:
        "Launch an app by the id returned from list_apps (or an explicit .exe path), then call list_apps again " +
        "to pick its window.",
      inputSchema: { app: z.string().min(1).describe("App id from list_apps, or a full .exe path.") },
    },
    withErrors(async ({ app }) => {
      await client.call("launch_app", { app });
      return textResult(`Launched ${app}. Call list_apps or list_windows to select its window.`);
    }),
  );

  server.registerTool(
    "activate_window",
    {
      title: "Activate window",
      description:
        "Bring a window to the foreground. Input tools already do this; use it to recover when input lands on " +
        "another window, then observe again.",
      inputSchema: { window: windowSchema },
    },
    withErrors(async ({ window }) => {
      await client.call("activate_window", { window });
      return textResult("Window activated. Observe it again before using coordinates or element indexes.");
    }),
  );

  server.registerTool(
    "get_window_state",
    {
      title: "Get window state",
      description:
        "Observe a window: screenshots (works even when occluded) and/or the accessibility tree with element " +
        "indexes. Screenshots, screenshot ids and element indexes are only valid until the next action.",
      inputSchema: {
        window: windowSchema,
        include_screenshot: z.boolean().default(true),
        include_text: z
          .boolean()
          .default(false)
          .describe("Accessibility tree, focused element, selected and document text."),
      },
      annotations: READ_ONLY,
    },
    withErrors(async ({ window, include_screenshot, include_text }) => {
      if (!include_screenshot && !include_text) throw new Error("Request include_screenshot, include_text, or both.");
      const mode = include_screenshot && include_text ? "both" : include_screenshot ? "screenshot" : "text";
      return { content: await observer.observe(window, mode) };
    }),
  );
}
