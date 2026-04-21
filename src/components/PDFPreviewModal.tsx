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

export function PDFPreviewModal({ isOpen, onClose, onDownload, title, children }: PDFPreviewProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-6">
          <h2 className="flex items-center gap-2 text-2xl font-black uppercase text-[#003d7a]">
            <Eye className="h-6 w-6" /> {title} Preview
          </h2>
          <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-50 p-8">
          <div className="mx-auto max-w-4xl rounded-xl bg-white p-8 shadow-sm">{children}</div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-6">
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
  return (
    <div className="relative mb-8">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-black tracking-widest text-[#003d7a] opacity-10">
        OFFICIAL
      </div>
      <div className="relative">
        <h1 className="mb-2 text-2xl font-black text-[#003d7a]">WATER ANALYSIS CERTIFICATE</h1>
        <p className="mb-4 text-xs text-gray-500">
          Certificate Number: <strong>{certificate.certNumber}</strong>
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <PreviewField label="Client" value={certificate.client || 'Not provided'} />
          <PreviewField label="Sample Type" value={certificate.sampleType || 'Not provided'} />
          <PreviewField label="Sample Location" value={certificate.location || 'Not provided'} />
          <PreviewField label="Date Sampled" value={certificate.dateSampled || 'Not provided'} />
          <PreviewField
            label="Client Contact"
            value={
              <div className="space-y-1">
                {certificate.clientPhone ? <p>Phone: {certificate.clientPhone}</p> : null}
                {certificate.clientEmail ? <p>Email: {certificate.clientEmail}</p> : null}
                {!certificate.clientPhone && !certificate.clientEmail ? <p>Not provided</p> : null}
              </div>
            }
          />
          <PreviewField
            label="Samples"
            value={certificate.samples.length > 0 ? certificate.samples.join(', ') : 'None'}
          />
        </div>

        <table className="mb-6 w-full border-collapse border border-gray-300 text-xs">
          <thead className="bg-[#003d7a] text-white">
            <tr>
              <th className="border p-2 text-left">Parameter</th>
              <th className="border p-2 text-center">Unit</th>
              <th className="border p-2 text-center">Limit</th>
              {certificate.samples.map((sample) => (
                <th key={sample} className="border p-2 text-center">
                  {sample}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {certificate.tableData.map((row, index) =>
              row.section ? (
                <tr key={`${row.id}-${index}`} className="bg-gray-100">
                  <td colSpan={3 + certificate.samples.length} className="p-2 text-sm font-bold uppercase text-gray-700">
                    {row.section}
                  </td>
                </tr>
              ) : (
                <tr key={`${row.id}-${index}`} className="hover:bg-blue-50">
                  <td className="border p-2 text-sm font-semibold">{row.name || '-'}</td>
                  <td className="border p-2 text-center text-xs">{row.unit || '-'}</td>
                  <td className="border p-2 text-center font-mono text-xs">{row.limit || '-'}</td>
                  {certificate.samples.map((sample, sampleIndex) => (
                    <td key={`${sample}-${sampleIndex}`} className="border p-2 text-center text-xs">
                      {row.results[sampleIndex] || '-'}
                    </td>
                  ))}
                </tr>
              )
            )}
          </tbody>
        </table>

        <div className="mt-6 border-t-2 border-[#003d7a] pt-6">
          <p className="mb-4 text-xs text-gray-600">
            Date Reported: <strong>{certificate.dateReported || 'Not provided'}</strong>
          </p>
          <div className="grid grid-cols-1 gap-8 text-sm md:grid-cols-2">
            <div className="text-center">
              <SignaturePreview
                name={certificate.sign1Name}
                title={certificate.sign1Title}
                image={certificate.sign1SignatureImage}
                fallbackName="Authorized Officer"
              />
            </div>
            <div className="text-center">
              <SignaturePreview
                name={certificate.sign2Name}
                title={certificate.sign2Title}
                image={certificate.sign2SignatureImage}
                fallbackName="Verification Officer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuotationPreviewDocument({ quotation }: { quotation: Quotation }) {
  return (
    <div className="relative mb-8">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-black tracking-widest text-[#003d7a] opacity-10">
        OFFICIAL
      </div>
      <div className="relative">
        <h1 className="mb-2 text-2xl font-black text-[#003d7a]">SERVICE QUOTATION</h1>
        <p className="mb-6 text-xs text-gray-500">
          Quote Number: <strong>{quotation.quoteNumber}</strong>
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <PreviewField label="Client" value={quotation.client || 'Not provided'} />
          <PreviewField label="Date" value={quotation.date || 'Not provided'} />
          <PreviewField
            label="Client Contact"
            value={
              <div className="space-y-1">
                {quotation.clientPhone ? <p>Phone: {quotation.clientPhone}</p> : null}
                {quotation.clientEmail ? <p>Email: {quotation.clientEmail}</p> : null}
                {!quotation.clientPhone && !quotation.clientEmail ? <p>Not provided</p> : null}
              </div>
            }
          />
          <PreviewField label="Valid Until" value={quotation.validUntil || 'Not provided'} />
          <PreviewField
            label="Billing Address"
            className="md:col-span-2"
            value={<p className="whitespace-pre-wrap text-sm">{quotation.clientAddress || 'Not provided'}</p>}
          />
        </div>

        <p className="mb-4 text-xs text-gray-600">
          <strong>Samples:</strong> {quotation.samples.length > 0 ? quotation.samples.join(', ') : 'None'}
        </p>

        <table className="mb-6 w-full border-collapse border border-gray-300 text-xs">
          <thead className="bg-[#003d7a] text-white">
            <tr>
              <th className="border p-2 text-center">#</th>
              <th className="border p-2 text-left">Description</th>
              <th className="border p-2 text-center">Qty</th>
              <th className="border p-2 text-right">Unit Price</th>
              <th className="border p-2 text-right">Tax (16%)</th>
              <th className="border p-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((item, index) => (
              <tr key={item.id} className="hover:bg-blue-50">
                <td className="border p-2 text-center text-xs">{index + 1}</td>
                <td className="border p-2 text-sm">{item.parameterName}</td>
                <td className="border p-2 text-center text-xs">{item.quantity}</td>
                <td className="border p-2 text-right text-xs font-mono">K {item.unitPrice.toFixed(2)}</td>
                <td className="border p-2 text-right text-xs font-mono text-orange-600">K {item.tax.toFixed(2)}</td>
                <td className="border p-2 text-right text-sm font-bold">K {item.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mb-6 space-y-2 border-t-2 border-[#003d7a] pt-4 text-sm">
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">Subtotal</span>
            <span className="font-bold">K {quotation.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-orange-600">
            <span className="font-semibold">VAT (16%)</span>
            <span className="font-bold">K {quotation.totalTax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between rounded bg-[#e8b400]/10 p-3 font-bold text-[#003d7a]">
            <span className="uppercase">Grand Total</span>
            <span className="text-lg">K {quotation.totalAmount.toFixed(2)}</span>
          </div>
        </div>

        <div className="mt-6 border-t-2 border-[#003d7a] pt-6">
          <div className="grid grid-cols-1 gap-8 text-sm md:grid-cols-2">
            <div className="text-center">
              <SignaturePreview
                name={quotation.sign1Name}
                title={quotation.sign1Title}
                image={quotation.sign1SignatureImage}
                fallbackName="Prepared By"
              />
            </div>
            <div className="text-center">
              <SignaturePreview
                name={quotation.sign2Name}
                title={quotation.sign2Title}
                image={quotation.sign2SignatureImage}
                fallbackName="Authorized Signatory"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
