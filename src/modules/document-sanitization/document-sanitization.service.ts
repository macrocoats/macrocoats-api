import { normalizeIngredientName } from '../hazard-profiles/hazard-profiles.normalize.js'
import type { HazardProfileRow } from '../hazard-profiles/hazard-profiles.service.js'
import type {
  RawComponent,
  SanitizedTdsCompositionRow,
  MsdsIngredientDisclosure,
  HazardAggregate,
  HazardClassificationUnion,
  InternalHazardBreakdownEntry,
  InternalCompositionRow,
} from './document-sanitization.types.js'

/**
 * Pure derivation logic — no DB access. The ingredient-profile map is always
 * passed in by the caller (products.service.ts), which is what keeps these
 * functions unit-testable in isolation.
 */

const SANITIZED_MSDS_NOTE =
  'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.'

/** Buckets a real percentage into the same free-text display-range style used in seed data. */
export function percentToBand(percent: number | null): string {
  if (percent === null) return 'Balance'
  if (percent < 1)  return '<1%'
  if (percent < 2)  return '1–2%'
  if (percent < 5)  return '2–5%'
  if (percent < 10) return '5–10%'
  if (percent < 20) return '10–20%'
  if (percent < 30) return '20–30%'
  if (percent < 50) return '30–50%'
  if (percent < 70) return '50–70%'
  if (percent < 90) return '70–90%'
  return '>90%'
}

function lookupProfile(materialName: string, profileMap: Map<string, HazardProfileRow>): HazardProfileRow | undefined {
  return profileMap.get(normalizeIngredientName(materialName))
}

export function buildSanitizedTdsComposition(
  components: RawComponent[],
  profileMap: Map<string, HazardProfileRow>,
): SanitizedTdsCompositionRow[] {
  return components.map((c) => {
    const profile = lookupProfile(c.materialName, profileMap)
    if (!profile) {
      // Logged server-side only for QA visibility into dictionary gaps — never returned to the client.
      console.warn(`[document-sanitization] No hazard profile match for ingredient "${c.materialName}" — falling back to "Proprietary Component".`)
      return {
        name:     'Proprietary Component',
        function: '—',
        percent:  percentToBand(c.percentage),
        compat:   '—',
      }
    }
    return {
      name:     profile.genericDescription,
      function: profile.functionCategory,
      percent:  percentToBand(c.percentage),
      compat:   profile.compatNotes ?? '—',
    }
  })
}

export function buildMsdsIngredientDisclosure(
  components: RawComponent[],
  profileMap: Map<string, HazardProfileRow>,
): MsdsIngredientDisclosure {
  const ingredients: MsdsIngredientDisclosure['ingredients'] = []
  let residualSum = 0

  for (const c of components) {
    const profile = lookupProfile(c.materialName, profileMap)
    const percentage = c.percentage ?? 0

    if (
      profile &&
      profile.disclosureRequired &&
      profile.disclosureThresholdPercent !== null &&
      c.percentage !== null &&
      c.percentage >= profile.disclosureThresholdPercent
    ) {
      const firstClass = profile.hazardClassifications[0]
      ingredients.push({
        name:        profile.genericDescription,
        description: profile.genericDescription,
        percent:     percentToBand(c.percentage),
        ghsClass:    firstClass?.class ?? '—',
        tagType:     firstClass?.tagType ?? 'safe',
      })
    } else {
      residualSum += percentage
    }
  }

  if (residualSum > 0) {
    ingredients.push({
      name:        'Proprietary Chemical Blend',
      description: 'Blend of non-hazardous or below-threshold proprietary ingredients',
      percent:     percentToBand(residualSum),
      ghsClass:    '—',
      tagType:     'safe',
    })
  }

  return { ingredients, note: SANITIZED_MSDS_NOTE }
}

export function deriveHazardAggregate(
  components: RawComponent[],
  profileMap: Map<string, HazardProfileRow>,
): HazardAggregate {
  const pictogramSet = new Set<string>()
  const classificationMap = new Map<string, HazardClassificationUnion>()
  const hStatementParts: string[] = []
  const hStatementCodesSeen = new Set<string>()
  const pStatementCodesSeen = new Set<string>()

  for (const c of components) {
    if (c.percentage === null) continue   // null = water/balance, never triggers hazard contribution
    const profile = lookupProfile(c.materialName, profileMap)
    if (!profile) continue
    if (c.percentage < Number(profile.thresholdPercent)) continue

    for (const p of profile.pictograms) pictogramSet.add(p)

    for (const cls of profile.hazardClassifications) {
      const key = `${cls.class}::${cls.category}`
      if (!classificationMap.has(key)) {
        classificationMap.set(key, { class: cls.class, category: cls.category, tagType: cls.tagType })
      }
      if (!hStatementCodesSeen.has(cls.hStatementCode)) {
        hStatementCodesSeen.add(cls.hStatementCode)
        hStatementParts.push(`${cls.hStatementCode} — ${cls.hStatementText}.`)
      }
      for (const pCode of cls.pStatementCodes) pStatementCodesSeen.add(pCode)
    }
  }

  const classifications = Array.from(classificationMap.values())
  const signalWord: 'DANGER' | 'Warning' = classifications.some((c) => c.tagType === 'danger') ? 'DANGER' : 'Warning'

  return {
    pictograms:      Array.from(pictogramSet),
    classifications,
    hStatements:     hStatementParts.join(' '),
    pStatements:     Array.from(pStatementCodesSeen).join(' · '),
    signalWord,
  }
}

/** QA-only breakdown of which ingredient triggered which classification. Only ever attached when view === 'internal'. */
export function buildInternalHazardBreakdown(
  components: RawComponent[],
  profileMap: Map<string, HazardProfileRow>,
): InternalHazardBreakdownEntry[] {
  return components.map((c) => {
    const profile = lookupProfile(c.materialName, profileMap)
    if (!profile) {
      return { materialName: c.materialName, percentage: c.percentage, matched: false, triggeredClasses: [] }
    }
    const triggered = c.percentage !== null && c.percentage >= Number(profile.thresholdPercent)
      ? profile.hazardClassifications.map((cls) => ({ class: cls.class, category: cls.category, tagType: cls.tagType }))
      : []
    return { materialName: c.materialName, percentage: c.percentage, matched: true, triggeredClasses: triggered }
  })
}

/** Raw passthrough — only ever used when the caller has verified role === 'superadmin' && view === 'internal'. */
export function buildInternalComposition(components: RawComponent[]): InternalCompositionRow[] {
  return components.map((c) => ({
    materialName: c.materialName,
    percentage:   c.percentage,
    unit:         c.unit,
  }))
}
