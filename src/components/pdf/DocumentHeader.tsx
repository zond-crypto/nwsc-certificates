/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CompanyInfo } from '../../types';

interface DocumentHeaderProps {
  company: CompanyInfo;
  department: string;
  documentTitle: string;
}

export default function DocumentHeader({ company, department, documentTitle }: DocumentHeaderProps) {
  return (
    <div className="flex flex-col w-full bg-white text-[#004a99] p-6 print:p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2 rounded-full border-[1.5px] border-[#004a99]">
             <div className="relative w-16 h-16 flex items-center justify-center">
                <img src="/logo.png" alt="Logo" className="w-12 h-12 object-contain" />
             </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#004a99]">{company.name}</h1>
            <p className="text-xs text-gray-700 leading-tight max-w-md">{company.address}</p>
            <p className="text-[10px] text-gray-600 mt-1">
              Tel: {company.phone} | Fax: {company.fax}
            </p>
            <p className="text-[10px] text-gray-600">
              {company.email} | {company.website}
            </p>
          </div>
        </div>
      </div>
      
      <div className="mt-6 flex flex-col items-center">
        <div className="w-full h-[1px] bg-[#004a99]/30 mb-2"></div>
        <h2 className="text-sm font-semibold tracking-widest text-[#004a99] uppercase">{department}</h2>
        <h3 className="text-2xl font-bold mt-1 tracking-wider uppercase text-[#004a99]">{documentTitle}</h3>
        <div className="w-full h-[1px] bg-[#004a99]/30 mt-2"></div>
      </div>
    </div>
  );
}
