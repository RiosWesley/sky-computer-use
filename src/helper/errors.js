export const USER_STOP_MESSAGE =
  "Computer Use was stopped by the user with the physical Escape key. Stop your work, do not call further " +
  "Computer Use tools, and tell the user that Computer Use was stopped.";

/** The user pressed Escape while the helper was driving the desktop. */
export class UserStoppedError extends Error {
  constructor() {
    super(USER_STOP_MESSAGE);
    this.name = "UserStoppedError";
  }
}

/** The user (or the lack of an approval UI) refused access to an app. */
export class ApprovalDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApprovalDeniedError";
  }
}

/** An error string reported by codex-computer-use.exe for a specific request. */
export class HelperError extends Error {
  constructor(method, message) {
    super(`${method}: ${message}`);
    this.name = "HelperError";
  }
}

export function isUserStopMessage(message) {
  return typeof message === "string" && message.includes("stopped by the user with the physical Escape key");
}
