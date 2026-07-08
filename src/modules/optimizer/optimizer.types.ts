/**
 * Shared type contract for the AI Formulation Optimizer.
 *
 * This file is the single source of truth for the shapes exchanged between
 * the optimizer business logic (optimizer.service.ts), the AI provider
 * layer (ai/), and — mirrored in camelCase JSON — the frontend.
 *
 * The AI layer is deliberately isolated behind the `AIProvider` interface so
 * the heuristic engine can later be swapped for OpenAI / Azure OpenAI / a
 * local LLM without touching business logic.
 */

// ── Goals ─────────────────────────────────────────────────────────────────────

export const OPTIMIZATION_GOALS = [
  'reduce-cost',
  'increase-profit',
  'reduce-ipa',
  'reduce-voc',
  'improve-flash-rust',
  'improve-corrosion-resistance',
  'reduce-foam',
  'maintain-cleaning',
  'use-inventory',
  'minimize-waste',
] as const

export type OptimizationGoal = (typeof OPTIMIZATION_GOALS)[number]

// ── Variant approval workflow ─────────────────────────────────────────────────

export const VARIANT_STATUSES = [
  'draft',
  'ai_suggested',
  'reviewed',
  'approved',
  'production',
] as const

export type VariantStatus = (typeof VARIANT_STATUSES)[number]

/** Statuses that permit batch generation, inventory deduction, labels, CoA, TDS, MSDS. */
export const USABLE_VARIANT_STATUSES: VariantStatus[] = ['approved', 'production']

/** Linear approval state machine (same style as product_documents STATUS_TRANSITIONS). */
export const VARIANT_STATUS_TRANSITIONS: Record<VariantStatus, VariantStatus[]> = {
  draft:        ['reviewed'],
  ai_suggested: ['reviewed', 'draft'],
  reviewed:     ['approved', 'draft'],
  approved:     ['production', 'reviewed'],
  production:   ['approved'],
}

// ── Optimizer inputs ──────────────────────────────────────────────────────────

export interface OptimizerComponentInput {
  materialName: string
  /** Percentage of total volume (0–100). Null = unspecified (QS / balance). */
  percentage: number | null
  unit: 'L' | 'Kg'
}

export interface OptimizerTargets {
  sellingPricePerL?: number | null
  profitMarginPct?: number | null
  ph?: number | null
  specificGravity?: number | null
  /** Annual production volume in litres — used for annual savings projection. */
  annualVolumeL?: number | null
}

// ── Enriched analysis data (built by optimizer.service, consumed by AI layer) ─

export type PriceSource = 'inventory' | 'override' | 'unknown'
export type StockStatus = 'ok' | 'low' | 'out' | 'unknown'

export interface EnrichedComponent extends OptimizerComponentInput {
  /** ₹ per unit (L or Kg). Null when the material has no known price. */
  unitPrice: number | null
  priceSource: PriceSource
  /** ₹ contribution per litre of finished product. */
  costPerL: number
  /** Share of total raw-material cost (0–100). */
  costSharePct: number
  stockQty: number | null
  stockStatus: StockStatus
}

export interface HistoricalVariantSummary {
  variantId: string
  variantName: string
  status: VariantStatus
  companyDisplayName: string | null
  costPerL: number | null
  components: OptimizerComponentInput[]
}

export interface InventoryMaterialSummary {
  material: string
  unit: string
  price: number
  stockQty: number | null
  lowStockThreshold: number
}

/** Everything an AI provider is given to reason about one optimization request. */
export interface OptimizationContext {
  productKey: string
  variantId: string | null
  variantName: string | null
  components: EnrichedComponent[]
  goals: OptimizationGoal[]
  targets: OptimizerTargets
  performanceNotes: string | null
  currentCostPerL: number
  historicalVariants: HistoricalVariantSummary[]
  /** Full raw-material catalogue — lets providers propose substitutions. */
  inventoryMaterials: InventoryMaterialSummary[]
}

// ── AI provider output ────────────────────────────────────────────────────────

export type RecommendationType =
  | 'substitute'
  | 'reduce'
  | 'increase'
  | 'remove'
  | 'add'
  | 'rebalance'
  | 'inventory'
  | 'pricing'

export interface OptimizerRecommendation {
  id: string
  type: RecommendationType
  /** Material this recommendation applies to (null for formulation-wide advice). */
  materialName: string | null
  /** For type 'substitute'/'add': the material to switch to / introduce. */
  suggestedMaterial: string | null
  currentPercentage: number | null
  recommendedPercentage: number | null
  reason: string
  estimatedCostSavingPerL: number
  estimatedProfitImprovementPerL: number
  risks: string[]
  /** 0–1 confidence score. */
  confidence: number
  /** Which of the requested goals this recommendation serves. */
  goals: OptimizationGoal[]
}

export interface OptimizationResult {
  recommendations: OptimizerRecommendation[]
  /** The full recommended bill of materials with all accepted changes applied. */
  recommendedFormulation: OptimizerComponentInput[]
  /** Free-form provider notes (assumptions, caveats). */
  notes: string[]
  provider: string
}

/**
 * Pluggable AI backend. v1 ships a deterministic heuristic engine; future
 * providers (OpenAI, Azure OpenAI, local LLM) implement this same interface
 * and are selected via the AI_PROVIDER env var in ai/index.ts.
 */
export interface AIProvider {
  readonly name: string
  generateRecommendations(ctx: OptimizationContext): Promise<OptimizationResult>
}

// ── Financial impact (computed by optimizer.service, never by the AI layer) ──

export interface FinancialImpact {
  currentCostPerL: number
  optimizedCostPerL: number
  savingsPerL: number
  currentProfitPerL: number | null
  optimizedProfitPerL: number | null
  currentMarginPct: number | null
  newMarginPct: number | null
  /** savingsPerL × targets.annualVolumeL (null when volume not provided). */
  annualSavings: number | null
}

// ── Full analyze response (mirrors the /v1/optimizer/analyze data envelope) ──

export interface OptimizerAnalysis {
  totalCostPerL: number
  componentBreakdown: EnrichedComponent[]
  highCostMaterials: EnrichedComponent[]
  inventoryWarnings: string[]
  historicalVariants: HistoricalVariantSummary[]
}

export interface AnalyzeResponseData {
  analysis: OptimizerAnalysis
  recommendations: OptimizerRecommendation[]
  recommendedFormulation: OptimizerComponentInput[]
  financialImpact: FinancialImpact
  notes: string[]
  provider: string
  generatedAt: string
}
