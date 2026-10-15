/**
 * Largest scale (<= 1) that keeps an image within the edge and pixel budgets.
 * Claude downsizes oversized images on its own, which would silently break
 * click coordinates, so we downsize first and keep track of the factor.
 */
export function fitScale(width, height, { maxEdge, maxPixels }) {
  const edgeScale = maxEdge / Math.max(width, height);
  const pixelScale = Math.sqrt(maxPixels / (width * height));
  return Math.min(1, edgeScale, pixelScale);
}

/** Image-pixel coordinate (what Claude sees) -> helper coordinate (logical window pixels). */
export function toHelperCoordinate(value, scale) {
  return Math.round(value / scale);
}
