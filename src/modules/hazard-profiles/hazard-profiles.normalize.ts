/**
 * Normalizes a raw ingredient/material name into a stable lookup key.
 *
 * - lowercases
 * - strips parenthetical content, e.g. "Sodium Nitrite (NaNO₂)" → "sodium nitrite"
 * - collapses whitespace/hyphens to single spaces
 * - trims
 *
 * No fuzzy matching — this is intentionally simple. Distinct spellings that
 * should resolve to the same ingredient must be listed explicitly in that
 * ingredient's `aliases[]` array.
 */
export function normalizeIngredientName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')   // strip parenthetical content
    .replace(/[-–—]/g, ' ')       // hyphens/dashes → space
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // strip other punctuation (₂, ₃, etc. are letters? no — strip)
    .replace(/\s+/g, ' ')
    .trim()
}
