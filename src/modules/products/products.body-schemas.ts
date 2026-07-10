import { z } from 'zod'
import type { DocType } from '../../types/index.js'

/**
 * Zod schemas for the `body` JSONB column of `product_documents`, for the
 * doc types that have a real (non-arbitrary) shape: formula, tds, msds.
 * `label`/`coa` deliberately have no schema here — out of scope (see plan §6).
 *
 * Shapes were derived by reading every formula/tds/msds row in
 * `src/seed/products.seed.ts` and were verified read-only against every
 * currently-seeded row before being wired into the PUT route as a blocking
 * check (see the one-off verification script referenced in the delivery
 * report). One legitimate shape variance was found and accommodated here
 * rather than "fixed" in the seed data: `corrucut-500`'s MSDS uses six
 * separate top-level keys (toxicology/ecology/disposal/transport/regulatory/
 * other) instead of the single `sections11to16` object every other product
 * uses — both shapes are valid GHS/SDS section-11-to-16 content, just
 * organized differently, so `msdsSectionsSchema` accepts either form via
 * `.passthrough()` and optional fields for both shapes.
 */

// ── formula ──────────────────────────────────────────────────────────────────

const formulaCompositionRowSchema = z.object({
  srNo:       z.number(),
  name:       z.string().min(1),
  casNo:      z.string(),
  baseQty:    z.number().nullable(),
  unit:       z.enum(['L', 'kg', 'Kg']),
  percentWV:  z.number().nullable(),
  function:   z.string(),
  density:    z.number().nullable(),
  unitPrice:  z.number(),
})

const formulaPreparationStepSchema = z.object({
  step:   z.number(),
  title:  z.string(),
  detail: z.string(),
})

const formulaOperatingConditionSchema = z.object({
  param: z.string(),
  value: z.string(),
})

export const formulaBodySchema = z.object({
  classification:      z.string(),
  batchSize:            z.string(),
  formulaType:          z.string(),
  referenceBatchSize:   z.number(),
  batchUnit:            z.string(),
  totalActivePercent:   z.number(),
  overview:             z.string(),
  composition:          z.array(formulaCompositionRowSchema).min(1),
  preparation:          z.array(formulaPreparationStepSchema),
  operatingConditions:  z.array(formulaOperatingConditionSchema),
  applications: z.object({
    removes:    z.array(z.string()),
    usedBefore: z.array(z.string()),
  }),
}).passthrough()

// ── tds ──────────────────────────────────────────────────────────────────────

const tdsFeatureSchema = z.object({ head: z.string(), body: z.string() })
const tdsPhysicalPropertySchema = z.object({
  property: z.string(),
  value:    z.string(),
  unit:     z.string(),
  method:   z.string(),
})
const tdsCompositionRowSchema = z.object({
  name:     z.string(),
  function: z.string(),
  percent:  z.string(),
  compat:   z.string(),
})
const tdsApplicationStepSchema = z.object({
  step:  z.string(),
  name:  z.string(),
  param: z.string(),
  value: z.string(),
})
const tdsPackagingRowSchema = z.object({
  size: z.string(),
  unit: z.string(),
  type: z.string(),
})
const tdsPerformanceRowSchema = z.object({ label: z.string(), val: z.string() })

export const tdsBodySchema = z.object({
  grade:       z.string(),
  description: z.string(),
  sections: z.object({
    features:            z.array(tdsFeatureSchema),
    physicalProperties:  z.array(tdsPhysicalPropertySchema),
    // Composition may be a normal sanitized array or a raw internal-view/override
    // shape when read back through the variant-aware GET — kept permissive here
    // since PUT always writes the baseline (non-variant) document.
    composition:         z.array(tdsCompositionRowSchema),
    application:         z.array(tdsApplicationStepSchema),
    packaging:           z.array(tdsPackagingRowSchema),
    performance:         z.array(tdsPerformanceRowSchema),
    safetyNote:          z.string(),
  }).passthrough(),
}).passthrough()

// ── msds ─────────────────────────────────────────────────────────────────────

const msdsIdentificationSchema = z.object({
  productType:  z.string(),
  intendedUse:  z.string(),
  manufacturer: z.string(),
  emergency:    z.string(),
}).passthrough()

const msdsClassificationSchema = z.object({
  class:    z.string(),
  category: z.string(),
  tagType:  z.string(),
})

const msdsHazardsSchema = z.object({
  pictograms:      z.array(z.string()),
  classifications: z.array(msdsClassificationSchema),
  hStatements:     z.string(),
  pStatements:     z.string(),
}).passthrough()

const msdsIngredientSchema = z.object({
  name:        z.string(),
  description: z.string(),
  percent:     z.string(),
  ghsClass:    z.string(),
  tagType:     z.string(),
})

const msdsCompositionSchema = z.object({
  ingredients: z.array(msdsIngredientSchema),
  note:        z.string(),
}).passthrough()

const msdsFirstAidSchema = z.object({
  eyes:       z.string(),
  skin:       z.string(),
  inhalation: z.string(),
  ingestion:  z.string(),
  warning:    z.string().optional(),
}).passthrough()

const msdsFireFightingSchema = z.object({
  flammability:       z.string(),
  extinguishingMedia: z.string(),
  fireHazard:         z.string(),
  ppe:                z.string(),
}).passthrough()

const msdsHandlingSchema = z.object({
  handling:    z.string(),
  storageTemp: z.string(),
  containers:  z.string(),
  segregation: z.string(),
  shelfLife:   z.string(),
}).passthrough()

const msdsExposureSchema = z.object({
  ppeItems:    z.array(z.string()),
  engineering: z.string(),
}).passthrough()

const msdsPhysicalRowSchema = z.object({ key: z.string(), val: z.string() })

const msdsStabilitySchema = z.object({
  stability:      z.string(),
  avoid:          z.string(),
  decomposition:  z.string(),
  polymerisation: z.string(),
}).passthrough()

export const msdsBodySchema = z.object({
  signalWord: z.string(),
  sections: z.object({
    identification:     msdsIdentificationSchema,
    hazards:             msdsHazardsSchema,
    // Sanitized {ingredients, note} shape when written via PUT. Internal/override
    // reads via the variant-aware GET may return a raw array instead — permissive
    // here since PUT always writes the baseline document.
    composition:         msdsCompositionSchema,
    firstAid:             msdsFirstAidSchema,
    fireFighting:         msdsFireFightingSchema,
    accidentalRelease:    z.array(z.string()),
    handling:             msdsHandlingSchema,
    exposure:             msdsExposureSchema,
    physical:             z.array(msdsPhysicalRowSchema),
    stability:             msdsStabilitySchema,
    // Every product but corrucut-500 uses this combined object; corrucut-500 uses
    // the six separate keys below instead. Both are valid — accept either.
    sections11to16:        z.record(z.string(), z.string()).optional(),
    toxicology:            z.string().optional(),
    ecology:               z.string().optional(),
    disposal:              z.string().optional(),
    transport:             z.string().optional(),
    regulatory:            z.string().optional(),
    other:                 z.string().optional(),
  }).passthrough(),
}).passthrough()

export const bodySchemaByDocType: Partial<Record<DocType, z.ZodTypeAny>> = {
  formula: formulaBodySchema,
  tds:     tdsBodySchema,
  msds:    msdsBodySchema,
}
