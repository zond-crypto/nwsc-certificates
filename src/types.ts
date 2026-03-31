export type Parameter = {
  id: string;
  section?: string;
  name?: string;
  unit?: string;
  limit?: string;
  results: string[];
  numeric_limit_low?: number;
  numeric_limit_high?: number;
  bio?: boolean;
};

export type Certificate = {
  id: string;
  certNumber: string;
  client: string;
  sampleType: string;
  dateSampled: string;
  dateReported: string;
  location: string;
  samples: string[];
  sign1Name: string;
  sign1Title: string;
  sign2Name: string;
  sign2Title: string;
  sign1SignatureId?: string;
  sign2SignatureId?: string;
  sign1SignatureImage?: string;
  sign2SignatureImage?: string;
  tableData: Parameter[];
  savedAt: string;
};

export type QuotationItem = {
  id: string;
  parameterName: string;
  unitPrice: number;
  quantity: number;
  tax: number;
  amount: number;
  totalWithTax: number;
};

export type Quotation = {
  id: string;
  quoteNumber: string;
  client: string;
  clientAddress: string;
  date: string;
  validUntil: string;
  items: QuotationItem[];
  subtotal: number;
  totalTax: number;
  totalAmount: number;
  sign1Name: string;
  sign1Title: string;
  sign2Name: string;
  sign2Title: string;
  sign1SignatureId?: string;
  sign2SignatureId?: string;
  sign1SignatureImage?: string;
  sign2SignatureImage?: string;
  savedAt: string;
};

export type Signature = {
  id: string;
  fullName: string;
  role: string;
  imageDataUrl: string; // Base64 PNG/JPG/svgable
  dateAdded: string;
  isDefault: boolean;
  lastUsedAt?: string;
};

export type ServicePrice = {
  id: string;
  parameterName: string;
  unitPrice: number;
};

export type WaterType = 'Drinking' | 'Borehole' | 'Surface' | 'Treated Effluent' | 'Waste Water';

export type RegulatoryLimit = {
  id: string;
  waterType: WaterType;
  regulatoryBody: 'ZABS' | 'ZEMA';
  parameterName: string;
  limitValue: string;
  unit: string;
};
