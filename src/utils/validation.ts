import { Certificate, Quotation } from '../types';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate Certificate before saving
 */
export function validateCertificate(cert: Certificate): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check required fields
  if (!cert.client || !cert.client.trim()) {
    errors.push({
      field: 'client',
      message: 'Client name is required'
    });
  }

  if (!cert.location || !cert.location.trim()) {
    errors.push({
      field: 'location',
      message: 'Sample location is required'
    });
  }

  if (!cert.sampleType) {
    errors.push({
      field: 'sampleType',
      message: 'Sample type must be selected'
    });
  }

  if (!cert.dateSampled) {
    errors.push({
      field: 'dateSampled',
      message: 'Date sampled is required'
    });
  }

  if (!cert.dateReported) {
    errors.push({
      field: 'dateReported',
      message: 'Date reported is required'
    });
  }

  if (!cert.certNumber || !cert.certNumber.trim()) {
    errors.push({
      field: 'certNumber',
      message: 'Certificate number is required'
    });
  }

  if (!cert.samples || cert.samples.length === 0) {
    errors.push({
      field: 'samples',
      message: 'At least one sample must be defined'
    });
  }

  // Check that at least one parameter has a result
  const hasAnyResults = cert.tableData.some(row => {
    if (row.section) return false;
    return row.results.some(r => r && r.trim());
  });

  if (!hasAnyResults) {
    errors.push({
      field: 'tableData',
      message: 'At least one test result must be entered'
    });
  }

  // Check signatures
  if (!cert.sign1Name || !cert.sign1Name.trim()) {
    errors.push({
      field: 'sign1Name',
      message: 'First signer name is required'
    });
  }

  if (!cert.sign1Title || !cert.sign1Title.trim()) {
    errors.push({
      field: 'sign1Title',
      message: 'First signer title is required'
    });
  }

  return errors;
}

/**
 * Validate Quotation before saving
 */
export function validateQuotation(quote: Quotation): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!quote.client || !quote.client.trim()) {
    errors.push({
      field: 'client',
      message: 'Client name is required'
    });
  }

  if (!quote.quoteNumber || !quote.quoteNumber.trim()) {
    errors.push({
      field: 'quoteNumber',
      message: 'Quote number is required'
    });
  }

  if (!quote.date) {
    errors.push({
      field: 'date',
      message: 'Quote date is required'
    });
  }

  if (!quote.validUntil) {
    errors.push({
      field: 'validUntil',
      message: 'Validity date is required'
    });
  }

  if (quote.date && quote.validUntil) {
    const issueDate = new Date(`${quote.date}T00:00:00`);
    const validUntilDate = new Date(`${quote.validUntil}T00:00:00`);

    if (Number.isNaN(issueDate.getTime()) || Number.isNaN(validUntilDate.getTime())) {
      errors.push({
        field: 'validUntil',
        message: 'Quotation dates must be valid calendar dates'
      });
    } else if (validUntilDate < issueDate) {
      errors.push({
        field: 'validUntil',
        message: 'Validity date cannot be earlier than the quotation date'
      });
    }
  }

  if (!quote.items || quote.items.length === 0) {
    errors.push({
      field: 'items',
      message: 'At least one quotation item is required'
    });
  }

  if (!quote.samples || quote.samples.length === 0) {
    errors.push({
      field: 'samples',
      message: 'At least one sample entry is required'
    });
  }

  // Validate each item
  quote.items.forEach((item, idx) => {
    if (!item.parameterName || !item.parameterName.trim()) {
      errors.push({
        field: `item_${idx}_name`,
        message: `Item ${idx + 1}: Parameter name is required`
      });
    }

    if (item.quantity <= 0) {
      errors.push({
        field: `item_${idx}_qty`,
        message: `Item ${idx + 1}: Quantity must be greater than 0`
      });
    }

    if (item.unitPrice < 0) {
      errors.push({
        field: `item_${idx}_price`,
        message: `Item ${idx + 1}: Unit price cannot be negative`
      });
    }

    if (item.unitPrice === 0) {
      errors.push({
        field: `item_${idx}_price`,
        message: `Item ${idx + 1}: Unit price is required`
      });
    }
  });

  const hasBillableItem = quote.items.some(item => item.quantity > 0 && item.unitPrice > 0);
  if (!hasBillableItem) {
    errors.push({
      field: 'items',
      message: 'At least one quotation item must have a quantity and unit price'
    });
  }

  // Check totals
  if (quote.subtotal === undefined || quote.subtotal < 0) {
    errors.push({
      field: 'subtotal',
      message: 'Invalid subtotal calculation'
    });
  }

  if (quote.totalAmount === undefined || quote.totalAmount < 0) {
    errors.push({
      field: 'totalAmount',
      message: 'Invalid total amount calculation'
    });
  }

  return errors;
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  const listItems = errors
    .map(e => `• ${e.message}`)
    .join('\n');

  return `Please fix the following issues:\n\n${listItems}`;
}
