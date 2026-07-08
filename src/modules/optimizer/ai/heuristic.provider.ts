/**
 * heuristic-v1 — the deterministic, offline formulation optimizer.
 *
 * No network calls, no API keys, no DB access. Given an OptimizationContext it
 * applies a fixed rule set (each gated on the requested goals and grounded in
 * the context's real numbers) and returns stable, reproducible recommendations.
 *
 * This is the reference implementation of the AIProvider interface. Swapping in
 * an LLM provider later only requires implementing the same interface in ai/
 * and registering it in ai/index.ts — no business-logic changes.
 */

import type {
  AIProvider,
  EnrichedComponent,
  InventoryMaterialSummary,
  OptimizationContext,
  OptimizationGoal,
  OptimizationResult,
  OptimizerComponentInput,
  OptimizerRecommendation,
} from '../optimizer.types.js'
import {
  classifyRole,
  isIPA,
  isVOC,
  normalizeMaterialName,
  LOW_VOC_ALTERNATIVES,
  PREFERRED_DEFOAMERS,
  PREFERRED_INHIBITORS,
} from './knowledge.js'

// ── Tunable constants ─────────────────────────────────────────────────────────

/** A component above this share of raw-material cost is a substitution target. */
const HIGH_COST_SHARE_PCT = 25
/** Conservative relative cut for a high-cost material with no cheaper substitute. */
const COST_REDUCE_STEP = 0.07
/** Relative trim applied to VOC/IPA solvents. */
const VOC_REDUCE_STEP = 0.05
/** Relative bump applied to corrosion inhibitors. */
const INHIBITOR_INCREASE_STEP = 0.15
/** Relative trim applied to a surfactant for the reduce-foam goal. */
const FOAM_SURFACTANT_STEP = 0.05
/** Never reduce a surfactant below this fraction of its current level when maintain-cleaning is set. */
const MIN_SURFACTANT_RETENTION = 0.70
/** % loading at which a new inhibitor is introduced. */
const ADD_INHIBITOR_PCT = 0.50
/** % loading at which a new defoamer is introduced. */
const ADD_DEFOAMER_PCT = 0.02
/** Max recommendations returned. */
const MAX_RECOMMENDATIONS = 10

const PROVIDER_NAME = 'heuristic-v1'

// ── Small formatting/number helpers ───────────────────────────────────────────

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function money(n: number): string {
  return `₹${round2(n).toFixed(2)}`
}

function pct(n: number): string {
  return `${round2(n).toFixed(2)}%`
}

type ActiveComponent = EnrichedComponent & { percentage: number }
type RecDraft = Omit<OptimizerRecommendation, 'id'>

// ── Main entry ────────────────────────────────────────────────────────────────

async function generateRecommendations(ctx: OptimizationContext): Promise<OptimizationResult> {
  const recs: RecDraft[] = []
  const notes: string[] = []
  /** Materials that already carry a formula-mutating recommendation. */
  const touched = new Set<string>()

  const wants = (g: OptimizationGoal) => ctx.goals.includes(g)
  const maintainCleaning = wants('maintain-cleaning')

  const invByNorm = new Map<string, InventoryMaterialSummary>()
  for (const m of ctx.inventoryMaterials) invByNorm.set(normalizeMaterialName(m.material), m)

  const active = ctx.components.filter(
    (c): c is ActiveComponent => c.percentage !== null,
  )

  /** Register a recommendation, guarding one formula-mutating rec per material. */
  const push = (draft: RecDraft, mutatesMaterial?: string | null): void => {
    if (mutatesMaterial) {
      const key = normalizeMaterialName(mutatesMaterial)
      if (touched.has(key)) return
      touched.add(key)
    }
    recs.push(draft)
  }

  const isTouched = (name: string) => touched.has(normalizeMaterialName(name))

  // Cheapest same-role inventory material strictly cheaper than the current one.
  const findCheaperSameRole = (c: ActiveComponent): InventoryMaterialSummary | null => {
    const price = c.unitPrice ?? 0
    if (price <= 0) return null
    const role = classifyRole(c.materialName)
    if (role === 'water') return null
    let best: InventoryMaterialSummary | null = null
    for (const m of ctx.inventoryMaterials) {
      if (m.price <= 0 || m.price >= price) continue
      if (classifyRole(m.material) !== role) continue
      if (normalizeMaterialName(m.material) === normalizeMaterialName(c.materialName)) continue
      if (!best || m.price < best.price) best = m
    }
    return best
  }

  // Cheapest in-stock same-role alternative (stock above its low-stock threshold).
  const findInStockSameRole = (c: EnrichedComponent): InventoryMaterialSummary | null => {
    const role = classifyRole(c.materialName)
    if (role === 'water') return null
    let best: InventoryMaterialSummary | null = null
    for (const m of ctx.inventoryMaterials) {
      if (m.stockQty === null || m.stockQty <= m.lowStockThreshold) continue
      if (classifyRole(m.material) !== role) continue
      if (normalizeMaterialName(m.material) === normalizeMaterialName(c.materialName)) continue
      if (!best || (m.price > 0 && best.price > 0 && m.price < best.price)) best = m
    }
    return best
  }

  const pickFromInventory = (names: string[]): InventoryMaterialSummary | null => {
    for (const name of names) {
      const m = invByNorm.get(normalizeMaterialName(name))
      if (m && m.price > 0) return m
    }
    return null
  }

  // ── Rule: pricing (targets miss the margin goal) ─────────────────────────────
  const selling = ctx.targets.sellingPricePerL
  const targetMargin = ctx.targets.profitMarginPct
  if (selling != null && selling > 0 && targetMargin != null) {
    const currentMargin = ((selling - ctx.currentCostPerL) / selling) * 100
    if (currentMargin < targetMargin) {
      const neededSelling = ctx.currentCostPerL / (1 - targetMargin / 100)
      const priceGap = round2(neededSelling - selling)
      const maxCostAtTarget = selling * (1 - targetMargin / 100)
      const costCut = round2(ctx.currentCostPerL - maxCostAtTarget)
      const pricingGoals = (['increase-profit', 'reduce-cost'] as OptimizationGoal[]).filter(wants)
      push({
        type: 'pricing',
        materialName: null,
        suggestedMaterial: null,
        currentPercentage: null,
        recommendedPercentage: null,
        reason:
          `Current margin is ${pct(currentMargin)} at ${money(selling)}/L (cost ${money(ctx.currentCostPerL)}/L), ` +
          `below the ${pct(targetMargin)} target. Raise the price to ${money(neededSelling)}/L ` +
          `(+${money(priceGap)}/L) or cut cost by ${money(costCut)}/L to close the gap.`,
        estimatedCostSavingPerL: 0,
        estimatedProfitImprovementPerL: priceGap,
        risks: ['A higher price may reduce competitiveness — validate against customer price expectations'],
        confidence: 0.9,
        goals: pricingGoals,
      })
    }
  }

  // ── Rule: cost-share analysis (reduce-cost / increase-profit) ────────────────
  if (wants('reduce-cost') || wants('increase-profit')) {
    const costGoals = (['reduce-cost', 'increase-profit'] as OptimizationGoal[]).filter(wants)
    const highCost = active
      .filter((c) => c.costSharePct > HIGH_COST_SHARE_PCT && (c.unitPrice ?? 0) > 0)
      .sort((a, b) => b.costSharePct - a.costSharePct)

    for (const c of highCost) {
      if (isTouched(c.materialName)) continue
      const price = c.unitPrice ?? 0
      const role = classifyRole(c.materialName)
      const cheaper = findCheaperSameRole(c)

      if (cheaper) {
        const saving = round2(c.costPerL * (1 - cheaper.price / price))
        push(
          {
            type: 'substitute',
            materialName: c.materialName,
            suggestedMaterial: cheaper.material,
            currentPercentage: c.percentage,
            recommendedPercentage: c.percentage,
            reason:
              `${c.materialName} drives ${pct(c.costSharePct)} of raw-material cost at ${money(price)}/${c.unit}; ` +
              `substituting same-role ${cheaper.material} at ${money(cheaper.price)}/${cheaper.unit} saves ~${money(saving)}/L ` +
              `at the current ${pct(c.percentage)} loading.`,
            estimatedCostSavingPerL: saving,
            estimatedProfitImprovementPerL: saving,
            risks: ['Substitute may differ in activity/performance — confirm equivalence with a lab trial before production'],
            confidence: 0.85,
            goals: costGoals,
          },
          c.materialName,
        )
      } else {
        let step = COST_REDUCE_STEP
        const risks: string[] = ['Lower loading may reduce performance — validate efficacy before production']
        if (role === 'surfactant' && maintainCleaning) {
          step = Math.min(step, 1 - MIN_SURFACTANT_RETENTION)
          risks.unshift('maintain-cleaning constraint: surfactant kept at ≥70% of current level')
        }
        const newPct = round2(c.percentage * (1 - step))
        const saving = round2(c.costPerL * step)
        push(
          {
            type: 'reduce',
            materialName: c.materialName,
            suggestedMaterial: null,
            currentPercentage: c.percentage,
            recommendedPercentage: newPct,
            reason:
              `${c.materialName} is ${pct(c.costSharePct)} of raw-material cost (${money(c.costPerL)}/L); ` +
              `no cheaper same-role substitute exists, so a conservative ${pct(step * 100)} relative cut to ${pct(newPct)} ` +
              `saves ~${money(saving)}/L.`,
            estimatedCostSavingPerL: saving,
            estimatedProfitImprovementPerL: saving,
            risks,
            confidence: 0.65,
            goals: costGoals,
          },
          c.materialName,
        )
      }
    }
  }

  // ── Rule: reduce-ipa / reduce-voc ────────────────────────────────────────────
  if (wants('reduce-ipa') || wants('reduce-voc')) {
    const vocGoals = (['reduce-ipa', 'reduce-voc'] as OptimizationGoal[]).filter(wants)
    for (const c of active) {
      if (isTouched(c.materialName)) continue
      const targetsIpa = wants('reduce-ipa') && isIPA(c.materialName)
      const targetsVoc = wants('reduce-voc') && isVOC(c.materialName)
      if (!targetsIpa && !targetsVoc) continue
      const newPct = round2(c.percentage * (1 - VOC_REDUCE_STEP))
      const saving = (c.unitPrice ?? 0) > 0 ? round2(c.costPerL * VOC_REDUCE_STEP) : 0
      push(
        {
          type: 'reduce',
          materialName: c.materialName,
          suggestedMaterial: null,
          currentPercentage: c.percentage,
          recommendedPercentage: newPct,
          reason:
            `${c.materialName} at ${pct(c.percentage)} is a high-VOC solvent; trimming ~${pct(VOC_REDUCE_STEP * 100)} ` +
            `to ${pct(newPct)} lowers VOC/emissions${saving > 0 ? ` and saves ~${money(saving)}/L` : ''}. ` +
            `Consider replacing part of it with ${LOW_VOC_ALTERNATIVES}.`,
          estimatedCostSavingPerL: saving,
          estimatedProfitImprovementPerL: saving,
          risks: ['Reducing solvent slows drying and can weaken cleaning/degreasing — validate dry-time and residue'],
          confidence: 0.55,
          goals: vocGoals,
        },
        c.materialName,
      )
    }
  }

  // ── Rule: improve-flash-rust / improve-corrosion-resistance ──────────────────
  if (wants('improve-flash-rust') || wants('improve-corrosion-resistance')) {
    const corrGoals = (['improve-flash-rust', 'improve-corrosion-resistance'] as OptimizationGoal[]).filter(wants)
    const inhibitors = active.filter((c) => classifyRole(c.materialName) === 'corrosion-inhibitor')

    if (inhibitors.length > 0) {
      for (const c of inhibitors) {
        if (isTouched(c.materialName)) continue
        const newPct = round2(c.percentage * (1 + INHIBITOR_INCREASE_STEP))
        const added = (c.unitPrice ?? 0) > 0 ? round2(c.costPerL * INHIBITOR_INCREASE_STEP) : 0
        push(
          {
            type: 'increase',
            materialName: c.materialName,
            suggestedMaterial: null,
            currentPercentage: c.percentage,
            recommendedPercentage: newPct,
            reason:
              `Raising corrosion inhibitor ${c.materialName} by ${pct(INHIBITOR_INCREASE_STEP * 100)} ` +
              `(from ${pct(c.percentage)} to ${pct(newPct)}) strengthens flash-rust/corrosion protection ` +
              `at ~${money(added)}/L added cost.`,
            estimatedCostSavingPerL: -added,
            estimatedProfitImprovementPerL: -added,
            risks: [
              'Increases raw-material cost',
              'Higher inhibitor levels can leave surface residue or affect downstream coating adhesion',
            ],
            confidence: 0.55,
            goals: corrGoals,
          },
          c.materialName,
        )
      }
    } else {
      const cand = pickFromInventory(PREFERRED_INHIBITORS)
      if (cand) {
        const added = round2((ADD_INHIBITOR_PCT / 100) * cand.price)
        push(
          {
            type: 'add',
            materialName: null,
            suggestedMaterial: cand.material,
            currentPercentage: null,
            recommendedPercentage: ADD_INHIBITOR_PCT,
            reason:
              `No corrosion inhibitor detected; adding ${cand.material} at ${pct(ADD_INHIBITOR_PCT)} ` +
              `(${money(cand.price)}/${cand.unit}) provides flash-rust protection at ~${money(added)}/L added cost.`,
            estimatedCostSavingPerL: -added,
            estimatedProfitImprovementPerL: -added,
            risks: ['Adds raw-material cost', 'May leave residue — verify substrate compatibility and rinsing'],
            confidence: 0.5,
            goals: corrGoals,
          },
          cand.material,
        )
      }
    }
  }

  // ── Rule: reduce-foam ────────────────────────────────────────────────────────
  if (wants('reduce-foam')) {
    const surfactants = active.filter((c) => classifyRole(c.materialName) === 'surfactant')
    const hasDefoamer = ctx.components.some((c) => classifyRole(c.materialName) === 'defoamer')
    const surfTotal = surfactants.reduce((s, c) => s + c.percentage, 0)

    if (surfactants.length > 0 && !hasDefoamer) {
      const def = pickFromInventory(PREFERRED_DEFOAMERS)
      if (def) {
        const added = round2((ADD_DEFOAMER_PCT / 100) * def.price)
        push(
          {
            type: 'add',
            materialName: null,
            suggestedMaterial: def.material,
            currentPercentage: null,
            recommendedPercentage: ADD_DEFOAMER_PCT,
            reason:
              `Surfactant loading totals ${pct(surfTotal)} with no defoamer present; adding ${def.material} ` +
              `at ${pct(ADD_DEFOAMER_PCT)} (${money(def.price)}/${def.unit}) controls foam at ~${money(added)}/L.`,
            estimatedCostSavingPerL: -added,
            estimatedProfitImprovementPerL: -added,
            risks: ['Over-dosing defoamer can cause cratering/fisheyes and reduce wetting — dose conservatively'],
            confidence: 0.6,
            goals: ['reduce-foam'],
          },
          def.material,
        )
      }
    } else if (surfactants.length > 0) {
      const c = [...surfactants].sort((a, b) => b.percentage - a.percentage)[0]
      if (!isTouched(c.materialName)) {
        let step = FOAM_SURFACTANT_STEP
        const risks: string[] = ['Reducing surfactant can lower detergency on heavily soiled parts']
        if (maintainCleaning) {
          step = Math.min(step, 1 - MIN_SURFACTANT_RETENTION)
          risks.unshift('maintain-cleaning constraint: surfactant kept at ≥70% of current level')
        }
        const newPct = round2(c.percentage * (1 - step))
        const saving = (c.unitPrice ?? 0) > 0 ? round2(c.costPerL * step) : 0
        push(
          {
            type: 'reduce',
            materialName: c.materialName,
            suggestedMaterial: null,
            currentPercentage: c.percentage,
            recommendedPercentage: newPct,
            reason:
              `A defoamer is already present; trimming the primary surfactant ${c.materialName} by ` +
              `${pct(step * 100)} to ${pct(newPct)} further reduces foaming` +
              `${saving > 0 ? ` and saves ~${money(saving)}/L` : ''}.`,
            estimatedCostSavingPerL: saving,
            estimatedProfitImprovementPerL: saving,
            risks,
            confidence: 0.6,
            goals: ['reduce-foam'],
          },
          c.materialName,
        )
      }
    }
  }

  // ── Rule: use-inventory (flag out/low stock, prefer in-stock substitutes) ────
  if (wants('use-inventory')) {
    for (const c of ctx.components) {
      if (c.stockStatus !== 'out' && c.stockStatus !== 'low') continue
      const alt = findInStockSameRole(c)
      const canPrice = alt !== null && (c.unitPrice ?? 0) > 0 && alt.price > 0 && c.percentage !== null
      const saving = canPrice ? Math.max(0, round2(c.costPerL * (1 - alt!.price / (c.unitPrice as number)))) : 0
      const stockLabel = c.stockStatus === 'out' ? 'out of stock' : 'below its low-stock threshold'
      const stockQtyNote = c.stockQty !== null ? ` (${c.stockQty} in stock)` : ''
      push({
        type: 'inventory',
        materialName: c.materialName,
        suggestedMaterial: alt ? alt.material : null,
        currentPercentage: c.percentage,
        recommendedPercentage: c.percentage,
        reason: alt
          ? `${c.materialName} is ${stockLabel}${stockQtyNote}; the same-role in-stock ${alt.material} ` +
            `(${alt.stockQty ?? '?'} available at ${money(alt.price)}/${alt.unit}) can be used` +
            `${saving > 0 ? `, saving ~${money(saving)}/L` : ''}.`
          : `${c.materialName} is ${stockLabel}${stockQtyNote}; reorder before the next batch to avoid a production stall.`,
        estimatedCostSavingPerL: saving,
        estimatedProfitImprovementPerL: saving,
        risks: ['Verify the substitute meets the same performance spec before switching'],
        confidence: 0.7,
        goals: ['use-inventory'],
      })
    }
  }

  // ── Rule: minimize-waste ─────────────────────────────────────────────────────
  if (wants('minimize-waste')) {
    const overstock = [...ctx.inventoryMaterials]
      .filter((m) => m.stockQty !== null && m.stockQty > m.lowStockThreshold * 5)
      .sort((a, b) => (b.stockQty ?? 0) - (a.stockQty ?? 0))[0]
    push({
      type: 'rebalance',
      materialName: null,
      suggestedMaterial: overstock ? overstock.material : null,
      currentPercentage: null,
      recommendedPercentage: null,
      reason: overstock
        ? `To minimise waste, size batches to whole-container multiples and prioritise consuming overstocked ` +
          `materials (e.g. ${overstock.material}, ${overstock.stockQty} in stock) before reordering.`
        : `To minimise waste, size batches to whole-container multiples so partially-opened raw-material packs ` +
          `are consumed before they degrade.`,
      estimatedCostSavingPerL: 0,
      estimatedProfitImprovementPerL: 0,
      risks: ['Advisory only — quantify against the actual batch schedule and container sizes'],
      confidence: 0.4,
      goals: ['minimize-waste'],
    })
  }

  // ── Finalise: sort by saving desc, cap, assign stable ids ────────────────────
  recs.sort((a, b) => b.estimatedCostSavingPerL - a.estimatedCostSavingPerL)
  const recommendations: OptimizerRecommendation[] = recs
    .slice(0, MAX_RECOMMENDATIONS)
    .map((r, i) => ({ id: `rec-${i + 1}`, ...r }))

  const { formulation, note } = applyRecommendations(ctx.components, recommendations, invByNorm)
  if (note) notes.push(note)

  notes.push('Prices and stock reflect inventory at analysis time — re-run after inventory updates.')
  notes.push('Cost figures are derived from percentage-of-volume contributions and current unit prices; density/unit differences are approximated.')
  notes.push('Performance-impact estimates are heuristic — validate every formulation change with a lab trial before production.')

  return {
    recommendations,
    recommendedFormulation: formulation,
    notes,
    provider: PROVIDER_NAME,
  }
}

// ── Apply accepted recommendations to the bill of materials ───────────────────

/**
 * Produce the recommended formulation by applying each formula-mutating
 * recommendation to the components, then rebalancing via the water/balance
 * component so the total is preserved. Percentages are rounded to 2dp and
 * never negative. If no water/balance component exists, totals are left as-is
 * and a note is returned.
 */
function applyRecommendations(
  components: EnrichedComponent[],
  recs: OptimizerRecommendation[],
  invByNorm: Map<string, InventoryMaterialSummary>,
): { formulation: OptimizerComponentInput[]; note: string | null } {
  const formula: OptimizerComponentInput[] = components.map((c) => ({
    materialName: c.materialName,
    percentage: c.percentage,
    unit: c.unit,
  }))

  const findIdx = (name: string) =>
    formula.findIndex((c) => normalizeMaterialName(c.materialName) === normalizeMaterialName(name))

  for (const rec of recs) {
    if (rec.type === 'substitute' && rec.materialName && rec.suggestedMaterial) {
      const i = findIdx(rec.materialName)
      if (i >= 0) {
        formula[i] = {
          materialName: rec.suggestedMaterial,
          percentage: rec.recommendedPercentage ?? formula[i].percentage,
          unit: formula[i].unit,
        }
      }
    } else if ((rec.type === 'reduce' || rec.type === 'increase') && rec.materialName) {
      const i = findIdx(rec.materialName)
      if (i >= 0 && rec.recommendedPercentage !== null) {
        formula[i] = { ...formula[i], percentage: Math.max(0, rec.recommendedPercentage) }
      }
    } else if (rec.type === 'remove' && rec.materialName) {
      const i = findIdx(rec.materialName)
      if (i >= 0) formula[i] = { ...formula[i], percentage: 0 }
    } else if (rec.type === 'add' && rec.suggestedMaterial && rec.recommendedPercentage !== null) {
      if (findIdx(rec.suggestedMaterial) < 0) {
        const invMat = invByNorm.get(normalizeMaterialName(rec.suggestedMaterial))
        formula.push({
          materialName: rec.suggestedMaterial,
          percentage: Math.max(0, rec.recommendedPercentage),
          unit: invMat?.unit === 'L' ? 'L' : 'Kg',
        })
      }
    }
    // 'inventory', 'pricing', 'rebalance' carry no direct formula change.
  }

  // Rebalance through the water/balance component so the total is preserved.
  let note: string | null = null
  const waterIdx = formula.findIndex((c) => classifyRole(c.materialName) === 'water')
  if (waterIdx >= 0) {
    const water = formula[waterIdx]
    // A null water percentage is a QS/balance marker — it absorbs changes
    // implicitly, so we leave it null. A numeric water value is recomputed.
    if (water.percentage !== null) {
      const originalTotal = components.reduce((s, c) => s + (c.percentage ?? 0), 0)
      const othersNew = formula.reduce(
        (s, c, i) => (i === waterIdx ? s : s + (c.percentage ?? 0)),
        0,
      )
      formula[waterIdx] = { ...water, percentage: Math.max(0, originalTotal - othersNew) }
    }
  } else {
    note = 'No water/balance component detected — percentages were not rebalanced; verify the total sums as intended.'
  }

  // Round every numeric percentage to 2dp and clamp non-negative.
  for (let i = 0; i < formula.length; i++) {
    const p = formula[i].percentage
    if (p !== null) formula[i] = { ...formula[i], percentage: round2(Math.max(0, p)) }
  }

  return { formulation: formula, note }
}

// ── Provider singleton ────────────────────────────────────────────────────────

export const heuristicProvider: AIProvider = {
  name: PROVIDER_NAME,
  generateRecommendations,
}
