// ─── Document types ───────────────────────────────────────────────────────────

export type DocType = 'quotation' | 'tds' | 'msds' | 'coa' | 'batch' | 'salary' | 'investor-report';

export type OutputFormat = 'buffer' | 'stream' | 'file';

// ─── Shared building blocks ───────────────────────────────────────────────────

export interface CompanyInfo {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode: string;
  gst: string;
  phone: string;
  email: string;
  website: string;
}

export interface CustomerInfo {
  companyName: string;
  contactPerson?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gst?: string;
  phone?: string;
  email?: string;
}

export interface SignatureBlock {
  preparedBy?: string;
  checkedBy?: string;
  approvedBy?: string;
  date?: string;
}

// ─── Quotation ────────────────────────────────────────────────────────────────

export interface QuotationLineItem {
  sNo: number;
  productName: string;
  productCode?: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
  amount: number;
}

export interface QuotationPayload {
  quotationNumber: string;
  quotationDate: string;
  validUntil?: string;
  customer: CustomerInfo;
  items: QuotationLineItem[];
  subtotal: number;
  discountAmount?: number;
  taxableAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  totalAmount: number;
  amountInWords?: string;
  termsAndConditions?: string[];
  remarks?: string;
  signature?: SignatureBlock;
}

// ─── TDS ──────────────────────────────────────────────────────────────────────

export interface TDSProperty {
  parameter: string;
  value: string;
  unit?: string;
  testMethod?: string;
}

export interface TDSPayload {
  productName: string;
  productCode: string;
  productLine: string;
  revisionNumber?: string;
  issueDate: string;
  description: string;
  applications: string[];
  features: string[];
  physicalProperties: TDSProperty[];
  chemicalProperties?: TDSProperty[];
  directions?: string[];
  dosage?: string;
  storage?: string;
  shelfLife?: string;
  packing?: string;
  precautions?: string[];
  remarks?: string;
  signature?: SignatureBlock;
}

// ─── MSDS ─────────────────────────────────────────────────────────────────────

export interface HazardStatement {
  code: string;
  statement: string;
}

export interface MSDSSection {
  sectionNumber: number;
  title: string;
  content: string | string[] | Record<string, string>;
}

export interface MSDSPayload {
  productName: string;
  productCode: string;
  productLine: string;
  revisionDate: string;
  revisionNumber?: string;
  emergencyPhone?: string;
  sections: MSDSSection[];
  ghsPictograms?: string[];
  hazardStatements?: HazardStatement[];
  precautionaryStatements?: HazardStatement[];
  signature?: SignatureBlock;
}

// ─── COA ──────────────────────────────────────────────────────────────────────

export interface COATestResult {
  parameter: string;
  specification: string;
  result: string;
  unit?: string;
  method?: string;
  status: 'PASS' | 'FAIL' | 'NA';
}

export interface COAPayload {
  productName: string;
  productCode: string;
  productLine: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate?: string;
  quantity?: string;
  customer?: CustomerInfo;
  testResults: COATestResult[];
  conclusion: 'APPROVED' | 'REJECTED' | 'CONDITIONAL';
  remarks?: string;
  signature?: SignatureBlock;
}

// ─── Batch Report ─────────────────────────────────────────────────────────────

export interface BatchComponent {
  sNo: number;
  rawMaterial: string;
  grade?: string;
  quantity: number;
  unit: string;
  percentage?: number;
}

export interface BatchPayload {
  batchNumber: string;
  productName: string;
  productLine: string;
  batchDate: string;
  batchSize: number;
  batchUnit: string;
  components: BatchComponent[];
  totalCost?: number;
  instructions?: string[];
  qcNotes?: string;
  signature?: SignatureBlock;
}

// ─── Investor Report (aspirational — see module CLAUDE.md: generatePDF's
// actual payload is untyped Record<string, unknown>) ───────────────────────────

export interface InvestorReportPayload {
  range: string;
  from: string;
  to: string;
  preparedBy?: string;
  kpis: Record<string, unknown>;
  analytics: Record<string, unknown>;
  projections: Record<string, unknown>;
  insights: Record<string, unknown>;
}

// ─── PDF generation options ───────────────────────────────────────────────────

export interface PDFOptions {
  format?: OutputFormat;
  outputPath?: string;
  filename?: string;
}

export interface RenderRequest<T = unknown> {
  docType: DocType;
  payload: T;
  options?: PDFOptions;
}

export interface RenderResult {
  buffer?: Buffer;
  filePath?: string;
  pageCount?: number;
  generatedAt: string;
}

// ─── Error types ──────────────────────────────────────────────────────────────

export class PDFError extends Error {
  constructor(
    message: string,
    public readonly code: PDFErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PDFError';
  }
}

export type PDFErrorCode =
  | 'TEMPLATE_NOT_FOUND'
  | 'INVALID_PAYLOAD'
  | 'RENDER_FAILED'
  | 'BROWSER_UNAVAILABLE'
  | 'BROWSER_CRASH'
  | 'TIMEOUT'
  | 'FILE_WRITE_FAILED'
  | 'UNKNOWN';
