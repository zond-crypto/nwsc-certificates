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
  tableData: Parameter[];
  savedAt: string;
};
