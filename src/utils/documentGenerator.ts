// @ts-ignore
import html2pdf from 'html2pdf.js';
// @ts-ignore
import Handlebars from 'handlebars';
import { Certificate, Quotation } from '../types';
import { formatKwacha } from '../pdf/utils/formatters';

Handlebars.registerHelper('addOne', (index) => index + 1);
Handlebars.registerHelper('index_even', (index) => index % 2 === 0);

export async function generateDocumentFromTemplate(templateName: 'coa' | 'quotation', data: any, filename: string, folder: string) {
  // 1. Fetch template exactly as designed
  const response = await fetch(`/templates/${templateName}.html`);
  const templateStr = await response.text();

  // 2. Read placeholders written like {{placeholder_name}}
  const template = Handlebars.compile(templateStr);

  // 3. Inject dynamic data from forms/database
  const htmlContent = template(data);

  // 4. Create an invisible container to hold the HTML
  const container = document.createElement('div');
  container.innerHTML = htmlContent;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);

  // 5. Preserves all formatting, logos, headers, signatures, and page layouts
  const opt = {
    margin: 0,
    filename: filename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
  };

  // 6. Converts completed documents into final PDF files
  const pdfBlob = await html2pdf().set(opt).from(container.firstElementChild as HTMLElement).outputPdf('blob');
  
  // Clean up
  document.body.removeChild(container);

  // 7. Store generated PDFs in organized folders
  // We send the PDF blob to our backend to be saved in the organized folder
  const formData = new FormData();
  formData.append('pdf', pdfBlob, filename);
  formData.append('folder', folder);

  try {
    await fetch('/api/store_pdf', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    console.error('Error storing PDF on backend:', error);
  }

  // 8. Allows users to preview, download, and print PDFs
  // html2pdf will also trigger a download automatically if we call save()
  // But here we'll let the user download it explicitly or we can trigger it
  const link = document.createElement('a');
  link.href = URL.createObjectURL(pdfBlob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  return pdfBlob;
}

export async function generateCOA(certificate: Certificate) {
  const data = {
    certNo: certificate.certNumber,
    client: certificate.client,
    dateReported: certificate.dateReported,
    location: certificate.location,
    sampleType: certificate.sampleType,
    dateSampled: certificate.dateSampled,
    headers: certificate.samples,
    rows: certificate.tableData.filter(r => !r.section).map(r => ({
      parameter: r.name,
      unit: r.unit,
      zabsLimit: r.limit,
      results: r.results
    })),
    signatories: [
      { name: certificate.sign1Name, title: certificate.sign1Title, signatureImage: certificate.sign1SignatureImage },
      { name: certificate.sign2Name, title: certificate.sign2Title, signatureImage: certificate.sign2SignatureImage }
    ]
  };

  const filename = `COA_${certificate.certNumber?.replace(/[^A-Za-z0-9]/g, '')}_${certificate.client.replace(/[^A-Za-z0-9]/g, '')}.pdf`;
  return generateDocumentFromTemplate('coa', data, filename, 'COA');
}

export async function generateQuotation(quotation: Quotation) {
  const data = {
    quotationNo: quotation.quotationCode || quotation.quoteNumber,
    clientName: quotation.client,
    clientContact: [quotation.clientPhone, quotation.clientEmail].filter(Boolean).join(' | '),
    dateIssued: quotation.date,
    validUntil: quotation.validUntil,
    samples: quotation.samples?.join(', ') || 'N/A',
    items: quotation.items.map(i => ({
      description: i.parameterName,
      unit: 'Test',
      quantity: i.quantity,
      unitPrice: formatKwacha(i.unitPrice),
      total: formatKwacha(i.amount)
    })),
    subtotal: formatKwacha(quotation.subtotal),
    tax: formatKwacha(quotation.totalTax),
    grandTotal: formatKwacha(quotation.totalAmount),
    terms: [
      'Payment is required prior to testing.',
      `Quotation valid until ${quotation.validUntil}.`,
      'Prices include 16% VAT where applicable.',
      'NWSC reserves the right to revise prices.'
    ],
    signatories: [
      { name: quotation.sign1Name, title: quotation.sign1Title, signatureImage: quotation.sign1SignatureImage },
      { name: quotation.sign2Name, title: quotation.sign2Title, signatureImage: quotation.sign2SignatureImage }
    ]
  };

  const filename = `QT_${(quotation.quotationCode || quotation.quoteNumber)?.replace(/[^A-Za-z0-9]/g, '')}_${quotation.client.replace(/[^A-Za-z0-9]/g, '')}.pdf`;
  return generateDocumentFromTemplate('quotation', data, filename, 'Quotations');
}
