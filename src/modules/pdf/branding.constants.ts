/**
 * Single source of truth for company branding used across all PDF header/
 * footer treatments. Before this, the same name/address/GSTIN/email/website
 * strings were hardcoded as separate literal copies inside
 * buildHeaderTemplate, buildFooterTemplate, and buildPrintMatchedHeader —
 * this file replaces those copies, not their surrounding logic.
 */
export const COMPANY = {
  name: 'Macro Coats',
  legalName: 'Macro Coats Pvt. Ltd.',
  tagline: 'Metal Surface Treatment Specialists',
  addressLine: 'SF.NO 224/11, Kalaimagal Nagar, Pazhanthandalam, Chennai - 600132, Tamil Nadu, India',
  gstin: '33AARCM7377G1ZY',
  phone: '+91 98840 80377',
  email: 'info@macrocoats.in',
  website: 'www.macrocoats.in',
} as const;
