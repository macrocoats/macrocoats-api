/**
 * Deterministic domain knowledge for the heuristic optimizer.
 *
 * All data here is offline, hand-curated from the factory inventory
 * (src/seed/inventory.seed.ts) and general surface-treatment chemistry.
 * It is intentionally free of DB/Fastify imports so it can be unit-tested
 * and reused by any AI provider (heuristic today, LLM tomorrow).
 *
 * Matching strategy: material names are normalised (see normalizeMaterialName)
 * and classified by substring pattern. Patterns are checked in priority order
 * so overlapping cases resolve deterministically (e.g. Sodium Gluconate is a
 * corrosion inhibitor first, chelating agent second).
 */

export type MaterialRole =
  | 'solvent'
  | 'surfactant'
  | 'corrosion-inhibitor'
  | 'defoamer'
  | 'chelating-agent'
  | 'ph-adjuster'
  | 'biocide'
  | 'water'
  | 'oil'
  | 'other'

/**
 * Normalise a raw-material name for comparison:
 * lowercase, trim, and collapse any run of whitespace/hyphens/underscores
 * into a single space. This makes 'LAE 9', 'LAE-9' and 'lae_9' equivalent —
 * the same convention the backend uses when matching inventory rows.
 */
export function normalizeMaterialName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, ' ')
}

interface RolePattern {
  role: MaterialRole
  patterns: string[]
}

/**
 * Priority-ordered role classification table. First matching group wins.
 * Order matters: defoamers before surfactants (both mention silicone/foam),
 * corrosion inhibitors before chelating agents (gluconate is in both).
 */
const ROLE_PATTERNS: RolePattern[] = [
  { role: 'water', patterns: ['water', 'aqua', 'deionised', 'deionized'] },
  { role: 'defoamer', patterns: ['defoamer', 'antifoam', 'anti foam'] },
  {
    role: 'surfactant',
    patterns: [
      'lae', 'alphox', 'alfox', 'sles', 'lauryl', 'ethoxylate', 'surfactant',
      'non ionic', 'nonionic', 'sorbitan', 'peg', 'ethylene glycol',
    ],
  },
  {
    role: 'corrosion-inhibitor',
    patterns: [
      'nitrite', 'nitrate', 'benzoate', 'molybdate', 'gluconate', 'zinc oxide',
      'thiourea', 'tdo', 'boric acid', 'borax', 'petroleum sulfonate',
      'petroleum sulphonate', 'sodium fluoride', 'hydroxylamine',
      'tap ', 'tap2', 'tap3', 'tap4',
    ],
  },
  {
    role: 'chelating-agent',
    patterns: ['edta', 'hexametaphosphate', 'shmp', 'citric acid'],
  },
  {
    role: 'ph-adjuster',
    patterns: [
      'metasilicate', 'sms', 'soda ash', 'sodium carbonate', 'trisodium phosphate',
      'tsp', 'mono sodium phosphate', 'phosphoric acid', 'caustic', 'naoh',
      'sodium hydroxide', 'triethanolamine', 'tea', 'monoethanolamine', 'mea',
      'ammonium hydroxide', 'ammonia', 'hexamine', 'manganese sulphate',
      'nickel sulphate',
    ],
  },
  {
    role: 'solvent',
    patterns: [
      'ipa', 'isopropyl', 'ethanol', 'methanol', 'acetone', 'butyl glycol',
      'butyl cellosolve', 'isopropyl acetate', 'ethyl acetate', 'pgme',
      'propylene glycol methyl ether', 'propylene glycol', 'exxol', 'exxsol',
      'd60', 'd80', 'd145', '32d',
    ],
  },
  { role: 'oil', patterns: ['methyl oleate', 'oleic', 'oleate', 'mineral oil', 'base oil'] },
  { role: 'biocide', patterns: ['biocide', 'isothiazolinone', 'bit', 'cit', 'mit'] },
]

/** Classify a material into a functional role for substitution/rules reasoning. */
export function classifyRole(name: string): MaterialRole {
  const n = normalizeMaterialName(name)
  for (const { role, patterns } of ROLE_PATTERNS) {
    if (patterns.some((p) => n.includes(p))) return role
  }
  return 'other'
}

// ── VOC / IPA flags ──────────────────────────────────────────────────────────

/** High-VOC solvents whose reduction lowers emissions (and usually cost). */
export const VOC_PATTERNS = [
  'ipa', 'isopropyl alcohol', 'isopropyl acetate', 'ethanol', 'methanol',
  'acetone', 'butyl glycol', 'butyl cellosolve', 'ethyl acetate', 'pgme',
  'propylene glycol methyl ether', 'exxol', 'exxsol', '32d',
] as const

/** Isopropyl alcohol specifically (targeted by the reduce-ipa goal). */
export const IPA_PATTERNS = ['ipa', 'isopropyl alcohol'] as const

export function isVOC(name: string): boolean {
  const n = normalizeMaterialName(name)
  return VOC_PATTERNS.some((p) => n.includes(p))
}

export function isIPA(name: string): boolean {
  const n = normalizeMaterialName(name)
  return IPA_PATTERNS.some((p) => n.includes(p))
}

/** Preferred low-VOC replacements when trimming solvent (display string). */
export const LOW_VOC_ALTERNATIVES = 'water or Propylene Glycol (PG)'

// ── Specific-gravity awareness ────────────────────────────────────────────────

/**
 * Approximate densities (g/mL) at ~25 °C from literature, keyed by name
 * pattern (checked in order). Used for specific-gravity sanity checks and
 * L↔Kg reasoning. Values are representative, not lot-specific.
 */
export const DENSITY_G_PER_ML: { pattern: string; density: number }[] = [
  { pattern: 'isopropyl acetate', density: 0.872 },
  { pattern: 'isopropyl alcohol', density: 0.785 },
  { pattern: 'ipa', density: 0.785 },
  { pattern: 'ethanol', density: 0.789 },
  { pattern: 'methanol', density: 0.792 },
  { pattern: 'acetone', density: 0.791 },
  { pattern: 'butyl glycol', density: 0.902 },
  { pattern: 'butyl cellosolve', density: 0.902 },
  { pattern: 'propylene glycol methyl ether', density: 0.923 },
  { pattern: 'propylene glycol', density: 1.036 },
  { pattern: 'peg', density: 1.128 },
  { pattern: 'triethanolamine', density: 1.124 },
  { pattern: 'tea', density: 1.124 },
  { pattern: 'monoethanolamine', density: 1.012 },
  { pattern: 'mea', density: 1.012 },
  { pattern: 'ammonium hydroxide', density: 0.90 },
  { pattern: 'phosphoric acid', density: 1.685 },
  { pattern: 'oleic', density: 0.895 },
  { pattern: 'methyl oleate', density: 0.873 },
  { pattern: 'exxol', density: 0.79 },
  { pattern: 'exxsol', density: 0.79 },
  { pattern: 'water', density: 1.0 },
]

/** Look up an approximate density (g/mL) for a material, or null if unknown. */
export function densityFor(name: string): number | null {
  const n = normalizeMaterialName(name)
  for (const { pattern, density } of DENSITY_G_PER_ML) {
    if (n.includes(pattern)) return density
  }
  return null
}

// ── Per-role substitution candidates ──────────────────────────────────────────

/**
 * Preferred, lower-cost / lower-VOC substitution candidates per role, listed
 * best-first. These are hints — the heuristic engine still price-checks against
 * the live inventory before proposing any swap. Names match inventory rows.
 */
export const SUBSTITUTION_CANDIDATES: Record<MaterialRole, string[]> = {
  solvent: ['Ethanol', 'Propylene Glycol (PG)', 'DM Water'],
  surfactant: ['Alphox 200 (Non-ionic Surfactant)', 'LAE-7'],
  'corrosion-inhibitor': ['Sodium Gluconate', 'Sodium Nitrite (NaNO₂)', 'Sodium Benzoate'],
  defoamer: ['Non-silicone Defoamer'],
  'chelating-agent': ['Sodium Gluconate', 'Sodium Hexametaphosphate (SHMP)'],
  'ph-adjuster': ['Soda Ash (Sodium Carbonate)', 'Sodium Metasilicate (SMS)'],
  biocide: [],
  water: [],
  oil: ['Methyl Oleate'],
  other: [],
}

/** Preferred inhibitors to introduce when a formula has no flash-rust protection. */
export const PREFERRED_INHIBITORS = ['Sodium Gluconate', 'Sodium Nitrite (NaNO₂)', 'Sodium Benzoate']

/** Preferred defoamers to introduce for the reduce-foam goal. */
export const PREFERRED_DEFOAMERS = ['Non-silicone Defoamer', 'Silicone Defoamer']
