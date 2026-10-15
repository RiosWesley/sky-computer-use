import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { fitScale } from "../src/screenshots/geometry.js";
import { prepareScreenshot } from "../src/screenshots/images.js";
import { ScreenshotRegistry } from "../src/screenshots/registry.js";

const BUDGET = { maxEdge: 1568, maxPixels: 1_150_000 };

test("a downscaled full-HD capture still maps clicks back to the original window pixels", async () => {
  const jpeg = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#123456" } })
    .jpeg()
    .toBuffer();
  const shot = { id: "screenshot-0", width: 1920, height: 1080, url: `data:image/jpeg;base64,${jpeg.toString("base64")}` };

  const prepared = await prepareScreenshot(shot, { ...BUDGET, jpegQuality: 80 });
  const { width, height } = await sharp(prepared.image.data).metadata();
  assert.ok(width * height <= BUDGET.maxPixels, `${width}x${height}`);

  const registry = new ScreenshotRegistry();
  registry.remember(1, [prepared]);
  const converter = registry.resolve(1, undefined);
  assert.equal(converter.toHelper(width - 1), 1919);
  assert.equal(converter.toHelper(0), 0);
});

test("keeps small window captures at full size", () => {
  assert.equal(fitScale(322, 534, BUDGET), 1);
});

test("maps image pixels back to helper coordinates of the chosen screenshot", () => {
  const registry = new ScreenshotRegistry();
  registry.remember(7, [
    { id: "screenshot-0", scale: 0.5 },
    { id: "screenshot-1", scale: 1 },
  ]);

  const converter = registry.resolve(7, "screenshot-0");
  assert.equal(converter.screenshotId, "screenshot-0");
  assert.equal(converter.toHelper(400), 800);
  assert.throws(() => registry.resolve(7, undefined), /pass screenshot_id/);
  assert.throws(() => registry.resolve(7, "screenshot-9"), /not part of the latest observation/);
  assert.equal(registry.resolve(99, undefined), null);
});
