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
  // Short locality for one-line footers (tds/msds print-matched footer).
  city: 'Chennai, India',
  certificateLocation: 'Chennai 600132, Tamil Nadu, India',
  addressLine: 'SF.NO 224/11, Kalaimagal Nagar, Pazhanthandalam, Chennai - 600132, Tamil Nadu, India',
  // Two-line masthead address for the Company Letterhead — mirrors
  // COMPANY_ADDRESS_LINES in safteyDataSheet/src/config/company.js.
  letterheadAddressLines: [
    'PL.NO 14 SF.NO 224/11, Kalaimagal Nagar',
    'Pazanthandalam, Kundrathur, Chennai 600 132',
  ],
  letterheadLegalName: 'Macro Coats Private Limited',
  gstin: '33AARCM7377G1ZY',
  phone: '+91 94449 61815',
  email: 'info@macrocoats.in',
  website: 'www.macrocoats.in',
  // Optional — only rendered by the Letterhead treatment when set. Left blank
  // (not fabricated) until Macro Coats provides real values.
  cin: '',
  isoCertification: '',
} as const;
