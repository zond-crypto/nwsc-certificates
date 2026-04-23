/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Droplets } from 'lucide-react';
import { COMPANY_INFO } from '../../pdf/constants';
import { WaterAnalysisData } from '../../types';
import DocumentHeader from './DocumentHeader';

interface WaterAnalysisCertificateProps {
  data: WaterAnalysisData;
}

export default function WaterAnalysisCertificate({ data }: WaterAnalysisCertificateProps) {
  return (
    <div className="relative flex flex-col bg-white shadow-2xl mx-auto w-[210mm] min-h-[297mm] font-sans text-[#1a1a1a] print:shadow-none print:m-0 overflow-hidden">
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
        <div className="flex flex-col items-center">
          <Droplets className="w-[500px] h-[500px]" />
          <p className="text-6xl font-bold mt-4 text-center">NKANA WATER SUPPLY<br/>AND SANITATION COMPANY</p>
        </div>
      </div>

      <DocumentHeader 
        company={COMPANY_INFO} 
        department="SAFETY HEALTH ENVIRONMENT AND QUALITY DEPARTMENT" 
        documentTitle="WATER ANALYSIS CERTIFICATE" 
      />

      <div className="px-14 py-6 flex-grow flex flex-col relative z-10">
        {/* Metadata Section */}
        <div className="grid grid-cols-3 gap-0 border border-gray-300 rounded-sm overflow-hidden mb-10 text-xs bg-sky-50/50">
          <div className="border-r border-b border-gray-300 p-2">
            <p className="font-bold text-[#004a99]">Cert No:</p>
            <p className="mt-1">{data.certNo}</p>
          </div>
          <div className="border-r border-b border-gray-300 p-2">
            <p className="font-bold text-[#004a99]">Client:</p>
            <p className="mt-1">{data.client}</p>
          </div>
          <div className="border-b border-gray-300 p-2">
            <p className="font-bold text-[#004a99]">Date Reported:</p>
            <p className="mt-1">{data.dateReported}</p>
          </div>
          <div className="border-r border-gray-300 p-2">
            <p className="font-bold text-[#004a99]">Sample Location:</p>
            <p className="mt-1">{data.location}</p>
          </div>
          <div className="border-r border-gray-300 p-2">
            <p className="font-bold text-[#004a99]">Sample Type:</p>
            <p className="mt-1">{data.sampleType}</p>
          </div>
          <div className="p-2">
            <p className="font-bold text-[#004a99]">Date Sampled:</p>
            <p className="mt-1">{data.dateSampled}</p>
          </div>
        </div>

        {/* Results Table */}
        <div className="border border-gray-300 rounded-sm overflow-hidden flex-grow flex flex-col">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-[#004a99] text-white text-center">
                <th className="border border-white/20 p-1 text-left px-3">Parameter</th>
                <th className="border border-white/20 p-1 w-16 text-center">Unit</th>
                <th className="border border-white/20 p-1 w-24 text-center">ZABS Limit</th>
                <th className="border border-white/20 p-1 w-12 text-center">Sample 1</th>
                <th className="border border-white/20 p-1 w-12 text-center">Sample 2</th>
                <th className="border border-white/20 p-1 w-12 text-center">Sample 3</th>
                <th className="border border-white/20 p-1 w-12 text-center">Sample 4</th>
                <th className="border border-white/20 p-1 w-12 text-center">Sample 5</th>
                <th className="border border-white/20 p-1 w-12 text-center">Sample 6</th>
                <th className="border border-white/20 p-1 w-12 text-center">Sample 7</th>
                <th className="border border-white/20 p-1 w-12 text-center">Sample 8</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, idx) => (
                <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="border border-gray-300 p-2.5 font-medium px-4">{row.parameter}</td>
                  <td className="border border-gray-300 p-2.5 text-center text-gray-600">{row.unit}</td>
                  <td className="border border-gray-300 p-2.5 text-center font-semibold">{row.zabsLimit}</td>
                  {row.results.map((res, i) => (
                    <td key={i} className="border border-gray-300 p-2.5 text-center">{res}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Signatories */}
        <div className="mt-10 border-t-2 border-[#004a99]/20 pt-4">
          <h4 className="text-sm font-bold text-[#004a99] uppercase tracking-wider mb-6">Authorised Signatories</h4>
          <div className="flex gap-40">
            {data.signatories.map((sig, i) => (
              <div key={i} className="w-1/3">
                <div className="border-b-2 border-gray-400 h-8 mb-2"></div>
                {sig.title !== "QUALITY ASSURANCE OFFICER" && (
                  <p className="font-bold text-sm">{sig.name}</p>
                )}
                <p className="text-xs text-gray-500 uppercase">{sig.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-[#004a99] text-white p-2 mt-auto flex justify-between items-center text-[10px] px-14">
        <p className="italic font-light tracking-wide">Bigger, Better, Smarter</p>
        <p>Page 1 of 1</p>
      </div>
    </div>
  );
}
