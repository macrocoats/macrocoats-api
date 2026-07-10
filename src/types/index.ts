// ── Shared domain types ───────────────────────────────────────────────────────

export type UserRole = 'superadmin' | 'company'

export interface AuthUser {
  id:              string
  name:            string
  role:            UserRole
  companyName:     string | null
  /** null = unrestricted (superadmin); string[] = allowed productLine keys */
  allowedProducts: string[] | null
}

export type DocType = 'tds' | 'msds' | 'formula' | 'label' | 'coa'

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
] as const
export type ProductKey = typeof PRODUCT_KEYS[number]

export const DOC_TYPES: DocType[] = ['tds', 'msds', 'formula', 'label', 'coa']

/** Doc types restricted to superadmin only */
export const RESTRICTED_DOC_TYPES: DocType[] = ['formula', 'label', 'coa']

export const DOCUMENT_VIEW_MODES = ['customer', 'internal'] as const
export type DocumentViewMode = typeof DOCUMENT_VIEW_MODES[number]
