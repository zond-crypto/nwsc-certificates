import { Parameter, QuotationItem, RegulatoryLimit } from './types';

export const DEFAULT_PARAMS: Parameter[] = [
  { id: 'p1', name: 'pH', unit: '', limit: '6.5 - 8.5', results: [''], numeric_limit_low: 6.5, numeric_limit_high: 8.5 },
  { id: 'p2', name: 'Turbidity', unit: 'NTU', limit: '<= 1', results: [''], numeric_limit_high: 1 },
  { id: 'p3', name: 'Colour', unit: 'TCU', limit: '<= 15', results: [''], numeric_limit_high: 15 },
  { id: 'p4', name: 'Temperature', unit: 'deg C', limit: '< 25', results: [''], numeric_limit_high: 25 },
  { id: 'p5', name: 'TDS', unit: 'mg/L', limit: '<= 1000', results: [''], numeric_limit_high: 1000 },
  { id: 'p6', name: 'TSS', unit: 'mg/L', limit: '<= 500', results: [''], numeric_limit_high: 500 },
  { id: 'p7', name: 'EC', unit: 'uS/cm', limit: '<= 1500', results: [''], numeric_limit_high: 1500 },
  { id: 'p8', name: 'Free Chlorine', unit: 'mg/L', limit: '0.2 - 0.5', results: [''], numeric_limit_low: 0.2, numeric_limit_high: 0.5 },
  { id: 'p9', name: 'Total Hardness', unit: 'mg/L', limit: '<= 500', results: [''], numeric_limit_high: 500 },
  { id: 'p10', name: 'Nitrate (NO3)', unit: 'mg/L', limit: '<= 50', results: [''], numeric_limit_high: 50 },
  { id: 'p11', name: 'Nitrite (NO2)', unit: 'mg/L', limit: '<= 3', results: [''], numeric_limit_high: 3 },
  { id: 'p12', name: 'Fluoride', unit: 'mg/L', limit: '<= 1.5', results: [''], numeric_limit_high: 1.5 },
  { id: 'p13', name: 'Iron (Fe)', unit: 'mg/L', limit: '<= 0.3', results: [''], numeric_limit_high: 0.3 },
  { id: 'p14', name: 'Manganese (Mn)', unit: 'mg/L', limit: '<= 0.1', results: [''], numeric_limit_high: 0.1 },
  { id: 'p15', name: 'Copper (Cu)', unit: 'mg/L', limit: '<= 2.0', results: [''], numeric_limit_high: 2.0 },
  { id: 'p16', name: 'Zinc (Zn)', unit: 'mg/L', limit: '<= 3.0', results: [''], numeric_limit_high: 3.0 },
  { id: 'p17', name: 'Chloride (Cl-)', unit: 'mg/L', limit: '<= 250', results: [''], numeric_limit_high: 250 },
  { id: 'p18', name: 'Sulphate (SO4)', unit: 'mg/L', limit: '<= 250', results: [''], numeric_limit_high: 250 },
  { id: 'p19', name: 'Alkalinity', unit: 'mg/L', limit: '<= 500', results: [''], numeric_limit_high: 500 },
  { id: 'p20', name: 'Calcium (Ca)', unit: 'mg/L', limit: '<= 200', results: [''], numeric_limit_high: 200 },
  { id: 'p21', name: 'Magnesium (Mg)', unit: 'mg/L', limit: '<= 150', results: [''], numeric_limit_high: 150 },
  { id: 'p22', name: 'Total Coliforms (T/Coli)', unit: 'CFU/100mL', limit: '0', results: [''], numeric_limit_high: 0, bio: true },
  { id: 'p23', name: 'Faecal Coliforms (F/Coli)', unit: 'CFU/100mL', limit: '0', results: [''], numeric_limit_high: 0, bio: true },
  { id: 'p24', name: 'HPC (22 deg C)', unit: 'CFU/mL', limit: '<= 100', results: [''], numeric_limit_high: 100 },
];

export const PARAMETER_PRICES = [
  { parameterName: 'pH', unitPrice: 150.0 },
  { parameterName: 'Turbidity', unitPrice: 150.0 },
  { parameterName: 'Colour', unitPrice: 150.0 },
  { parameterName: 'TDS', unitPrice: 150.0 },
  { parameterName: 'TSS', unitPrice: 200.0 },
  { parameterName: 'EC', unitPrice: 150.0 },
  { parameterName: 'Free Chlorine', unitPrice: 150.0 },
  { parameterName: 'Total Hardness', unitPrice: 250.0 },
  { parameterName: 'Nitrate (NO3)', unitPrice: 300.0 },
  { parameterName: 'Nitrite (NO2)', unitPrice: 300.0 },
  { parameterName: 'Iron (Fe)', unitPrice: 350.0 },
  { parameterName: 'Manganese (Mn)', unitPrice: 350.0 },
  { parameterName: 'Total Coliforms (T/Coli)', unitPrice: 450.0 },
  { parameterName: 'Faecal Coliforms (F/Coli)', unitPrice: 450.0 },
  { parameterName: 'HPC (22 deg C)', unitPrice: 450.0 },
  { parameterName: 'BOD', unitPrice: 650.0 },
  { parameterName: 'COD', unitPrice: 650.0 },
  { parameterName: 'Oil & Grease', unitPrice: 550.0 },
];

export const INITIAL_REGULATORY_LIMITS: RegulatoryLimit[] = [
  { id: 'rl1', regulatoryBody: 'ZABS', parameterName: 'pH', limitValue: '6.5 - 8.5', unit: '' },
  { id: 'rl2', regulatoryBody: 'ZABS', parameterName: 'Turbidity', limitValue: '<= 1', unit: 'NTU' },
  { id: 'rl3', regulatoryBody: 'ZEMA', parameterName: 'pH', limitValue: '6.0 - 9.0', unit: '' },
  { id: 'rl4', regulatoryBody: 'ZEMA', parameterName: 'COD', limitValue: '<= 90', unit: 'mg/L' },
];

export const DEFAULT_QUOTATION_ITEMS: QuotationItem[] = [
  { id: 'qi1', parameterName: 'pH', unitPrice: 150.0, quantity: 1, tax: 24.0, amount: 150.0, totalWithTax: 174.0 },
];
