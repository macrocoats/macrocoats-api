export type FormulaPreparationStep = {
  step: number
  title: string
  detail: string
  materialNames?: string[]
}

export type FormulaOverrides = {
  preparationStatus: 'draft_review_required' | 'approved'
  preparation: FormulaPreparationStep[]
}

const safetyStep: FormulaPreparationStep = {
  step: 1,
  title: 'Safety and equipment setup',
  detail: 'DRAFT — REVIEW REQUIRED. Confirm current supplier SDS controls before manufacture. Use a clean, dry, bonded and grounded closed mixing vessel with effective ventilation. Wear approved eye, hand and body protection, remove ignition sources, and keep suitable Class B fire response equipment available.',
}

const jellyStep = (step: number): FormulaPreparationStep => ({
  step,
  title: 'Precondition and add petroleum jelly',
  detail: 'Precondition the white petroleum jelly separately by an approved indirect-heating method only until it is sufficiently fluid to transfer. Do not use direct flame or heat the solvent blend without an approved plant temperature limit. Add slowly under continuous low-shear agitation until uniformly incorporated.',
  materialNames: ['White petroleum jelly'],
})

const finishSteps = (start: number): FormulaPreparationStep[] => [
  {
    step: start,
    title: 'Homogenise and inspect',
    detail: 'Continue controlled agitation until the batch is visually uniform with no undissolved material, sediment or phase separation. Record the actual mixing time, temperature and observations; fixed limits remain subject to plant validation.',
  },
  {
    step: start + 1,
    title: 'Sample, QC and fill',
    detail: 'Allow the batch to return to the approved filling condition. Sample using the controlled QC procedure and verify appearance, measured specific gravity, viscosity and flash point against the approved variant specification. The calculated specific gravity shown in the workspace is an estimate and is not a release result. Fill only after authorised release.',
  },
]

export const CORRUCUT_500_FORMULA_OVERRIDES: Record<string, FormulaOverrides> = {
  'Exxsol Blend Grade': {
    preparationStatus: 'draft_review_required',
    preparation: [
      safetyStep,
      {
        step: 2,
        title: 'Charge the carrier blend',
        detail: 'Start low-shear agitation, then charge Mineral Turpentine Oil, Light Paraffinic Mineral Oil, Exxol D60 and Exxol 32D in that order. Confirm each addition is uniform before charging the next material.',
        materialNames: ['Mineral Turpentine Oil (MTO)', 'Light Paraffinic Mineral Oil', 'Exxol D60', 'Exxol 32D'],
      },
      jellyStep(3),
      {
        step: 4,
        title: 'Add corrosion inhibitor',
        detail: 'Add Calcium Petroleum Sulfonate slowly under continuous agitation, avoiding local over-concentration. Mix until the inhibitor is fully dispersed and the batch is uniform.',
        materialNames: ['Calcium Petroleum Sulfonate'],
      },
      ...finishSteps(5),
    ],
  },
  'MTO-LLP High-Oil Grade': {
    preparationStatus: 'draft_review_required',
    preparation: [
      safetyStep,
      {
        step: 2,
        title: 'Charge the carrier oils',
        detail: 'Start low-shear agitation, charge Mineral Turpentine Oil, then add Light Paraffinic Mineral Oil. Confirm the carrier blend is uniform before continuing.',
        materialNames: ['Mineral Turpentine Oil (MTO)', 'Light Paraffinic Mineral Oil'],
      },
      jellyStep(3),
      {
        step: 4,
        title: 'Add corrosion inhibitor',
        detail: 'Add Calcium Petroleum Sulfonate slowly under continuous agitation, avoiding local over-concentration. Mix until fully dispersed.',
        materialNames: ['Calcium Petroleum Sulfonate'],
      },
      ...finishSteps(5),
    ],
  },
  'Na-Ba Sulfonate Grade': {
    preparationStatus: 'draft_review_required',
    preparation: [
      safetyStep,
      {
        step: 2,
        title: 'Charge the carrier blend',
        detail: 'Start low-shear agitation, then charge Mineral Turpentine Oil, Exxol 32D and Exxol D145 in that order. Confirm the blend is uniform before continuing.',
        materialNames: ['Mineral Turpentine Oil (MTO)', 'Exxol 32D', 'Exxol D145'],
      },
      jellyStep(3),
      {
        step: 4,
        title: 'Add sodium sulfonate',
        detail: 'Add Sodium Petroleum Sulfonate slowly under continuous agitation. Mix until uniformly dispersed before introducing the next inhibitor.',
        materialNames: ['Sodium Petroleum Sulfonate'],
      },
      {
        step: 5,
        title: 'Add barium sulfonate',
        detail: 'Add Barium Petroleum Sulfonate slowly under continuous agitation. Avoid local over-concentration and confirm uniformity before final homogenisation.',
        materialNames: ['Barium Petroleum Sulfonate'],
      },
      ...finishSteps(6),
    ],
  },
  'MTO Only Grade': {
    preparationStatus: 'draft_review_required',
    preparation: [
      safetyStep,
      {
        step: 2,
        title: 'Charge the carrier',
        detail: 'Charge Mineral Turpentine Oil to the mixing vessel and establish controlled low-shear agitation.',
        materialNames: ['Mineral Turpentine Oil (MTO)'],
      },
      jellyStep(3),
      {
        step: 4,
        title: 'Add corrosion inhibitor',
        detail: 'Add Calcium Petroleum Sulfonate slowly under continuous agitation, avoiding local over-concentration. Mix until fully dispersed.',
        materialNames: ['Calcium Petroleum Sulfonate'],
      },
      ...finishSteps(5),
    ],
  },
  'MTO-LLP Low-Oil Grade': {
    preparationStatus: 'draft_review_required',
    preparation: [
      safetyStep,
      {
        step: 2,
        title: 'Charge the carrier oils',
        detail: 'Start low-shear agitation, charge Mineral Turpentine Oil, then add Light Paraffinic Mineral Oil. Confirm the carrier blend is uniform before continuing.',
        materialNames: ['Mineral Turpentine Oil (MTO)', 'Light Paraffinic Mineral Oil'],
      },
      jellyStep(3),
      {
        step: 4,
        title: 'Add corrosion inhibitor',
        detail: 'Add Calcium Petroleum Sulfonate slowly under continuous agitation, avoiding local over-concentration. Mix until fully dispersed.',
        materialNames: ['Calcium Petroleum Sulfonate'],
      },
      ...finishSteps(5),
    ],
  },
}
