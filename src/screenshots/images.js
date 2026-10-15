import sharp from "sharp";
import { fitScale } from "./geometry.js";

/**
 * Turns one helper screenshot (`{ id, url: "data:image/...;base64,...", width, height, ... }`)
 * into an MCP-ready image plus the factor that maps image pixels back to helper coordinates.
 */
export async function prepareScreenshot(shot, imageOptions) {
  const { mimeType, bytes } = decodeDataUrl(shot.url);
  const metadata = await sharp(bytes).metadata();
  const scale = fitScale(metadata.width, metadata.height, imageOptions);

  let output = { data: bytes, mimeType, width: metadata.width, height: metadata.height };
  if (scale < 1) {
    const width = Math.max(1, Math.round(metadata.width * scale));
    const height = Math.max(1, Math.round(metadata.height * scale));
    const data = await sharp(bytes).resize(width, height).jpeg({ quality: imageOptions.jpegQuality }).toBuffer();
    output = { data, mimeType: "image/jpeg", width, height };
  }

  // The helper reports logical size; on high-DPI displays the captured bitmap may be larger.
  const logicalWidth = shot.width ?? metadata.width;
  return {
    id: shot.id,
    zIndex: shot.zIndex ?? 0,
    origin: { x: shot.originX, y: shot.originY },
    logicalSize: { width: logicalWidth, height: shot.height ?? metadata.height },
    image: output,
    scale: output.width / logicalWidth,
  };
}

function decodeDataUrl(url) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url ?? "");
  if (match == null) throw new Error("codex-computer-use.exe returned a screenshot that is not a base64 data URL");
  return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
}
