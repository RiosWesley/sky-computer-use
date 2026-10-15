import { toHelperCoordinate } from "./geometry.js";

/**
 * Remembers the screenshots of the latest observation per window so that
 * coordinates Claude reads off an image can be translated back for the helper.
 */
export class ScreenshotRegistry {
  #byWindow = new Map();

  remember(windowId, preparedShots) {
    this.#byWindow.set(windowId, new Map(preparedShots.map((shot) => [shot.id, shot])));
  }

  /**
   * Resolves which screenshot a coordinate refers to and converts points into helper space.
   * Returns `null` when the window was never observed (coordinates then pass through unchanged).
   */
  resolve(windowId, screenshotId) {
    const shots = this.#byWindow.get(windowId);
    if (shots == null || shots.size === 0) return null;

    if (screenshotId != null) {
      const shot = shots.get(screenshotId);
      if (shot == null) {
        throw new Error(`screenshot_id "${screenshotId}" is not part of the latest observation of window ${windowId}`);
      }
      return converterFor(shot);
    }
    if (shots.size > 1) {
      throw new Error(
        `The latest observation of window ${windowId} has ${shots.size} screenshots; pass screenshot_id ` +
          `(${[...shots.keys()].join(", ")}) to say which image the coordinates come from.`,
      );
    }
    return converterFor([...shots.values()][0]);
  }
}

function converterFor(shot) {
  return {
    screenshotId: shot.id,
    toHelper: (value) => toHelperCoordinate(value, shot.scale),
  };
}
