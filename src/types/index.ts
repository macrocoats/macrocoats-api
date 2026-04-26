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
] as const
export type ProductKey = typeof PRODUCT_KEYS[number]

export const DOC_TYPES: DocType[] = ['tds', 'msds', 'formula', 'label', 'coa']

/** Doc types restricted to superadmin only */
export const RESTRICTED_DOC_TYPES: DocType[] = ['formula', 'label', 'coa']
