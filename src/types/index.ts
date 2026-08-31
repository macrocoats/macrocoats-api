// ── Shared domain types ───────────────────────────────────────────────────────

// 'operator' is a Factory Operator: batches/finished-goods/dispatch/production-planning
// access only (view + the specific write actions that don't require formula/cost
// visibility — see requireRole.ts and each module's routes.ts for the exact grants).
export type UserRole = 'superadmin' | 'company' | 'operator'

export interface AuthUser {
  id:              string
  name:            string
  role:            UserRole
  companyName:     string | null
  /** null = unrestricted (superadmin); string[] = allowed productLine keys */
  allowedProducts: string[] | null
}

export const DOC_TYPES = ['tds', 'msds', 'formula', 'label', 'coa'] as const
export type DocType = typeof DOC_TYPES[number]

export const PRODUCT_KEYS = [
  'uniklean-sp',
  'uniklean-fe',
  'uniprotect-oil',
  'uniflow-ecm',
  'unicool-al',
  'unikoat-lt-700',
  'unisolve-h3',
  'unipass',
  'uniktonner',
  'corroklean',
  'corrcut-100',
  'corrucut-500',
  'uniklean-sf',
  'corrcut-200',
  'unicut-al',
  'uniklean-cu',
  'unikbrightner',
] as const
export type ProductKey = typeof PRODUCT_KEYS[number]

/** Doc types restricted to superadmin only */
export const RESTRICTED_DOC_TYPES: DocType[] = ['formula', 'label', 'coa']

export const DOCUMENT_VIEW_MODES = ['customer', 'internal'] as const
export type DocumentViewMode = typeof DOCUMENT_VIEW_MODES[number]
