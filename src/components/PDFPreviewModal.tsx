import React, { type ReactNode } from 'react';
import { Certificate, Quotation } from '../types';
import { Button } from '@/components/ui/button';
import { X, Eye, Download } from 'lucide-react';

interface PDFPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
  title: string;
  children: ReactNode;
}

function PreviewField({ label, value, className = '' }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
      <div className="font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function SignaturePreview({
  name,
  title,
  image,
  fallbackName,
}: {
  name?: string;
  title?: string;
  image?: string;
  fallbackName: string;
}) {
  if (!name && !title && !image) {
    return <p className="text-xs italic text-gray-500">No signatory assigned</p>;
  }

  return (
    <>
      {image ? (
        <img src={image} alt={name || fallbackName} className="mx-auto mb-2 h-10 object-contain" />
      ) : null}
      <p className="border-t border-gray-400 pt-2">________________________</p>
      <p className="font-bold text-[#003d7a]">{name || fallbackName}</p>
      <p className="text-xs text-gray-600">{title || 'No title assigned'}</p>
    </>
  );
}

import WaterAnalysisCertificate from './pdf/WaterAnalysisCertificate';
import QuotationTemplate from './pdf/Quotation';
import { WaterAnalysisData, QuotationData } from '../types';

export function PDFPreviewModal({ isOpen, onClose, onDownload, title, children }: PDFPreviewProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 p-6 bg-white">
          <h2 className="flex items-center gap-2 text-2xl font-black uppercase text-[#003d7a]">
            <Eye className="h-6 w-6" /> {title} Preview
          </h2>
          <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-200/50 p-4 sm:p-10">
          <div className="mx-auto shadow-2xl origin-top scale-[0.6] sm:scale-[0.8] md:scale-100 mb-10">
            {children}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 bg-white p-6">
          <Button onClick={onClose} variant="outline" className="border-gray-300 text-gray-700">
            Close
          </Button>
          <Button onClick={onDownload} className="bg-[#e8b400] font-bold text-black hover:bg-[#d4a200]">
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CertificatePreviewDocument({ certificate }: { certificate: Certificate }) {
  const data: WaterAnalysisData = {
    certNo: certificate.certNumber,
    client: certificate.client,
    dateReported: certificate.dateReported,
    location: certificate.location,
    sampleType: certificate.sampleType,
    dateSampled: certificate.dateSampled,
    rows: certificate.tableData
      .filter(r => !r.section)
      .map(r => ({
        id: r.id,
        parameter: r.name || '',
        unit: r.unit || '',
        zabsLimit: r.limit || '',
        results: r.results
      })),
    signatories: [
      { name: certificate.sign1Name, title: certificate.sign1Title },
      { name: certificate.sign2Name, title: certificate.sign2Title }
    ]
  };

  return <WaterAnalysisCertificate data={data} />;
}

export function QuotationPreviewDocument({ quotation }: { quotation: Quotation }) {
  const data: QuotationData = {
    quotationNo: quotation.quotationCode || quotation.quoteNumber,
    clientName: quotation.client,
    clientContact: [quotation.clientPhone, quotation.clientEmail].filter(Boolean).join(' | '),
    dateIssued: quotation.date,
    validUntil: quotation.validUntil,
    items: quotation.items.map(i => ({
      id: i.id,
      description: i.parameterName,
      unit: 'Test',
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.amount
    })),
    discount: 0,
    vatRate: 0.16,
    terms: [
      'Payment is required prior to testing.',
      `Quotation valid until ${quotation.validUntil}.`,
      'Prices include 16% VAT where applicable.'
    ],
    signatories: [
      { name: quotation.sign1Name, title: quotation.sign1Title },
      { name: quotation.sign2Name, title: quotation.sign2Title }
    ]
  };

  return <QuotationTemplate data={data} />;
}
