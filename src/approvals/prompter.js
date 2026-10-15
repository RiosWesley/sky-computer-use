/**
 * Asks the human through MCP elicitation, which Claude Code renders as a dialog.
 * This replaces the `createElicitation` hook that Codex's node_repl provides to @oai/sky.
 */
export class ElicitationPrompter {
  #server;

  /** @param {import("@modelcontextprotocol/sdk/server/index.js").Server} server */
  constructor(server) {
    this.#server = server;
  }

  get available() {
    return Boolean(this.#server.getClientCapabilities()?.elicitation);
  }

  /** @returns {Promise<"session" | "always" | "deny">} */
  async askAppAccess({ app, displayName, riskLevel, allowPersistentApproval }) {
    const risk = riskLevel === "high" ? " Risco: ALTO." : "";
    const response = await this.#server.elicitInput({
      message: `Permitir que o Claude controle "${displayName}" (${app}) via Computer Use?${risk}`,
      requestedSchema: {
        type: "object",
        properties: allowPersistentApproval
          ? {
              remember: {
                type: "boolean",
                title: "Lembrar sempre",
                description: "Desmarcado: vale só enquanto este servidor estiver aberto.",
                default: false,
              },
            }
          : {},
      },
    });
    if (response.action !== "accept") return "deny";
    return allowPersistentApproval && response.content?.remember === true ? "always" : "session";
  }

  async askResume() {
    const response = await this.#server.elicitInput({
      message: "O Computer Use foi interrompido com a tecla Esc. Permitir que o Claude volte a controlar o computador?",
      requestedSchema: { type: "object", properties: {} },
    });
    return response.action === "accept";
  }
}
