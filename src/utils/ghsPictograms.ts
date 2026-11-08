/**
 * GHS/CLP pictogram derivation from H-statement codes (pure, unit-tested in
 * tests/unit/ghs-pictograms.test.ts).
 *
 * Mirrors the web Label Studio's `utils/hazardToGhs.js#requiredGhsForCodes`
 * so labels, MSDS and the Hazard profiles review agree. Change both together.
 *
 * Pictogram ids are the SDS ids stored on hazard profiles and read by the MSDS
 * templates (`flammable`, `corrosive`, `skull`, …), not `ghs02`-style ids.
 */

export type PictogramId =
  | 'explosive' | 'flammable' | 'oxidiser' | 'corrosive'
  | 'skull' | 'irritant' | 'healthhazard' | 'environment'

const H_CODE_TO_PICTOGRAM: Record<string, PictogramId> = {
  // GHS01 — Explosive
  H200: 'explosive', H201: 'explosive', H202: 'explosive', H203: 'explosive', H204: 'explosive', H205: 'explosive',
  // GHS02 — Flammable
  H220: 'flammable', H221: 'flammable', H222: 'flammable', H223: 'flammable', H224: 'flammable', H225: 'flammable',
  H226: 'flammable', H228: 'flammable', H241: 'flammable', H242: 'flammable', H250: 'flammable', H251: 'flammable',
  H252: 'flammable', H260: 'flammable', H261: 'flammable',
  // GHS03 — Oxidising
  H270: 'oxidiser', H271: 'oxidiser', H272: 'oxidiser',
  // GHS04 (gas under pressure, H280/H281) is deliberately unmapped: there is no profile id or
  // MSDS template diamond for it, and no product here is a pressurised gas.
  // GHS05 — Corrosive
  H290: 'corrosive', H314: 'corrosive', H318: 'corrosive',
  // GHS06 — Acute toxicity (severe)
  H300: 'skull', H301: 'skull', H310: 'skull', H311: 'skull', H330: 'skull', H331: 'skull',
  // GHS07 — Exclamation mark
  H302: 'irritant', H312: 'irritant', H315: 'irritant', H317: 'irritant', H319: 'irritant',
  H332: 'irritant', H335: 'irritant', H336: 'irritant',
  // GHS08 — Health hazard
  H304: 'healthhazard', H334: 'healthhazard', H340: 'healthhazard', H341: 'healthhazard', H350: 'healthhazard',
  H351: 'healthhazard', H360: 'healthhazard', H361: 'healthhazard', H362: 'healthhazard', H370: 'healthhazard',
  H371: 'healthhazard', H372: 'healthhazard', H373: 'healthhazard',
  // GHS09 — Environment (Aquatic Acute 1, Chronic 1–2 only)
  H400: 'environment', H410: 'environment', H411: 'environment',
}

/** Statements with no pictogram: Aquatic Chronic 3/4 (CLP Annex I) and UN-GHS eye irritation 2B. */
export const NO_PICTOGRAM_CODES = new Set(['H412', 'H413', 'H320'])

/** "h 314", "H314+H318" → ['H314', 'H318']. */
export const splitHCodes = (raw: string | null | undefined): string[] =>
  String(raw ?? '').toUpperCase().replace(/\s+/g, '').split('+').filter(Boolean)

/**
 * Pictograms the given H-codes require, after the CLP Art. 26 precedence rules:
 *   - skull (GHS06) present → no exclamation mark (GHS07);
 *   - GHS05 for skin corrosion / eye damage (H314, H318) → GHS07 not used for
 *     H315/H319 (GHS05 from H290 alone does not suppress it — ECHA guidance);
 *   - respiratory sensitiser H334 (GHS08) → GHS07 not used for H315/H317/H319.
 */
export function pictogramsForHCodes(codes: string[]): Set<PictogramId> {
  const all = codes.flatMap(splitHCodes)
  const byPictogram = new Map<PictogramId, Set<string>>()
  for (const code of all) {
    const id = H_CODE_TO_PICTOGRAM[code]
    if (!id) continue
    if (!byPictogram.has(id)) byPictogram.set(id, new Set())
    byPictogram.get(id)!.add(code)
  }
  const irritant = byPictogram.get('irritant')
  if (irritant) {
    const suppressed = new Set<string>()
    if (all.includes('H314') || all.includes('H318')) ['H315', 'H319'].forEach((c) => suppressed.add(c))
    if (all.includes('H334')) ['H315', 'H317', 'H319'].forEach((c) => suppressed.add(c))
    const remaining = [...irritant].filter((c) => !suppressed.has(c))
    if (byPictogram.has('skull') || remaining.length === 0) byPictogram.delete('irritant')
  }
  return new Set(byPictogram.keys())
}

/**
 * Mixture pictograms for an MSDS: derived from the H-codes of every
 * contributing ingredient, plus the stored pictograms of contributing
 * profiles that carry no H-codes (legacy data), then the skull-over-
 * exclamation rule applied once more across the combined set.
 */
export function mixturePictograms(hCodes: string[], storedFromUncoded: string[]): string[] {
  const set = new Set<string>([...pictogramsForHCodes(hCodes), ...storedFromUncoded])
  if (set.has('skull')) set.delete('irritant')
  return [...set]
}
