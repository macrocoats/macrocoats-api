/**
 * Whole-word raw-material name matching — a port of `findMaterialMatch` /
 * `isWaterMaterial` in safteyDataSheet/src/utils/formulationCalc.js, so batch
 * creation resolves formula materials to Inventory items exactly the way the
 * Formula page prices them. Keep the two copies in sync (both have tests).
 */

const normalize = (name: string): string =>
  name.toLowerCase().trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()

// Spellings that name the same material (supplier brand vs. our Inventory, UK vs. US).
const SPELLING_VARIANTS: [RegExp, string][] = [
  [/\bexxsol\b/g, 'exxol'],
  [/sulph/g, 'sulf'],
  [/\b([a-z0-9]+) free\b/g, 'non $1'], // "silicone free" = "non silicone"
]

// Physical-form words that don't change which material it is ("Borax Powder" = "Borax").
const FORM_WORDS = new Set(['powder', 'flakes', 'flake', 'solid', 'granules', 'granular', 'crystals', 'crystal'])

interface MaterialWords { tokens: Set<string>; negated: Set<string>; main: Set<string>; bracketed: Set<string> }

const materialWords = (name: string): MaterialWords => {
  let s = normalize(name)
  SPELLING_VARIANTS.forEach(([pattern, replacement]) => { s = s.replace(pattern, replacement) })
  const split = (text: string) => new Set(text.split(/[^a-z0-9]+/).filter((w) => w && !FORM_WORDS.has(w)))
  return {
    tokens:    split(s),
    negated:   new Set([...s.matchAll(/\bnon[\s-]+([a-z0-9]+)/g)].map((m) => m[1])),
    main:      split(s.replace(/\([^)]*\)/g, ' ')),
    bracketed: split([...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).join(' ')),
  }
}

const isSubset = (a: Set<string>, b: Set<string>) => [...a].every((token) => b.has(token))

const contradicts = (a: MaterialWords, b: MaterialWords) =>
  [...a.negated].some((w) => b.tokens.has(w) && !b.negated.has(w))
  || [...b.negated].some((w) => a.tokens.has(w) && !a.negated.has(w))

/** True for water / balance rows (DM Water, Water (DI/RO), …), which are not bought or stocked. */
export const isWaterMaterial = (name: string): boolean => materialWords(name).tokens.has('water')

/**
 * Pick the candidate that names the same material as `name` (whole words, any
 * order): exact normalized name → same word set → most specific candidate
 * contained in `name` → least-extra-words candidate containing `name` whose
 * extras are bracketed detail. Ties match nothing. See the frontend copy for
 * worked examples.
 */
export function findMaterialMatch(name: string, candidates: string[]): string | null {
  const key = normalize(name ?? '')
  if (!key || !candidates.length) return null
  const exact = candidates.find((c) => normalize(c) === key)
  if (exact !== undefined) return exact

  const words = materialWords(name)
  const { tokens } = words
  if (!tokens.size) return null
  const scored = candidates.map((c) => ({ c, w: materialWords(c) }))
    .filter((x) => x.w.tokens.size && !contradicts(words, x.w))
    .map((x) => ({ c: x.c, t: x.w.tokens, main: x.w.main, bracketed: x.w.bracketed }))

  const same = scored.find((x) => x.t.size === tokens.size && isSubset(x.t, tokens))
  if (same) return same.c

  type Scored = typeof scored[number]
  const unique = (list: Scored[]) =>
    (list.length === 1 || (list.length > 1 && list[0].t.size !== list[1].t.size) ? list[0].c : null)
  const contained = unique(scored.filter((x) => isSubset(x.t, tokens)).sort((a, b) => b.t.size - a.t.size))
  if (contained) return contained
  return unique(scored
    .filter((x) => isSubset(tokens, x.t) && (isSubset(x.main, tokens) || isSubset(tokens, x.bracketed)))
    .sort((a, b) => a.t.size - b.t.size))
}
