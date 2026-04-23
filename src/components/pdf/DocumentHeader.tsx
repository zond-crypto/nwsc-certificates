/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Droplets } from 'lucide-react';
import { CompanyInfo } from '../../types';

interface DocumentHeaderProps {
  company: CompanyInfo;
  department: string;
  documentTitle: string;
}

export default function DocumentHeader({ company, department, documentTitle }: DocumentHeaderProps) {
  return (
    <div className="flex flex-col w-full bg-[#004a99] text-white p-6 print:p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2 rounded-full border-4 border-[#004a99] shadow-inner">
             <div className="relative w-16 h-16 flex items-center justify-center">
                <Droplets className="w-12 h-12 text-[#004a99]" />
                <div className="absolute inset-0 border-2 border-[#004a99] rounded-full opacity-20"></div>
             </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
            <p className="text-xs opacity-90 leading-tight max-w-md">{company.address}</p>
            <p className="text-[10px] opacity-80 mt-1">
              Tel: {company.phone} | Fax: {company.fax}
            </p>
            <p className="text-[10px] opacity-80">
              {company.email} | {company.website}
            </p>
          </div>
        </div>
      </div>
      
      <div className="mt-6 flex flex-col items-center">
        <div className="w-full h-0.5 bg-white/30 mb-2"></div>
        <h2 className="text-sm font-semibold tracking-widest text-yellow-300 uppercase">{department}</h2>
        <h3 className="text-2xl font-bold mt-1 tracking-wider uppercase">{documentTitle}</h3>
        <div className="w-full h-0.5 bg-white/30 mt-2"></div>
      </div>
    </div>
  );
}
