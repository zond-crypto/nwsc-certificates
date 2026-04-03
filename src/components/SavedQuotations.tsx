import React, { useState, useMemo } from 'react';
import { Quotation } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, FolderOpen, Printer, Calculator, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getQuotationStatus } from '../utils/quotationUtils';

interface Props {
  quotations: Quotation[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function SavedQuotations({ quotations, onLoad, onDelete, onClearAll }: Props) {
  const [searchTerm, setSearchTerm] = useState("");

  // Group quotations by month
  const groupedQuotations = useMemo(() => {
    const groups = {};
    const filtered = quotations.filter(quote =>
      quote.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quoteNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quotationCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.clientAddress?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.forEach(quote => {
      const date = new Date(quote.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      if (!groups[monthKey]) {
        groups[monthKey] = {
          monthKey,
          monthLabel,
          quotations: []
        };
      }
      groups[monthKey].quotations.push(quote);
    });

    // Sort months descending and quotations within each month by date descending
    return Object.values(groups)
      .sort((a: any, b: any) => b.monthKey.localeCompare(a.monthKey))
      .map((group: any) => ({
        ...group,
        quotations: group.quotations.sort((a: Quotation, b: Quotation) => new Date(b.date).getTime() - new Date(a.date).getTime())
      }));
  }, [quotations, searchTerm]);

  if (quotations.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Calculator className="w-12 h-12 mx-auto mb-4 opacity-10" />
        <p>No saved quotations yet.</p>
      </div>
    );
  }

  const formatCurrency = (val: number) => `K ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by client, quote #, code, or address..."
            className="pl-10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="destructive" size="sm" onClick={onClearAll}>
          <Trash2 className="w-4 h-4 mr-2" /> Clear All
        </Button>
      </div>

      {groupedQuotations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No quotations match your search.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedQuotations.map(group => (
            <div key={group.monthKey} className="space-y-4">
              <h3 className="text-lg font-bold text-[#003d7a] border-b border-[#e8b400] pb-2">
                {group.monthLabel} ({group.quotations.length} quotation{group.quotations.length !== 1 ? 's' : ''})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.quotations.map(quote => {
                  const statusInfo = quote.expiryDate ? getQuotationStatus(quote.expiryDate) : { status: 'active' };
                  const statusBadge = statusInfo.status === 'expired' ? 'Expired' :
                                    statusInfo.status === 'expiring' ? 'Expiring Soon' : 'Active';

                  return (
                    <div key={quote.id} className={`bg-white rounded-lg shadow p-4 border-l-4 relative overflow-hidden ${
                      statusInfo.status === 'expired' ? 'border-red-400 bg-red-50' :
                      statusInfo.status === 'expiring' ? 'border-orange-400 bg-orange-50' :
                      'border-[#e8b400]'
                    }`}>
                      <div className="absolute top-2 right-2">
                        <span className={`px-2 py-1 text-xs font-bold rounded ${
                          statusInfo.status === 'expired' ? 'bg-red-100 text-red-800' :
                          statusInfo.status === 'expiring' ? 'bg-orange-100 text-orange-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {statusBadge}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-gray-500 flex justify-between mb-2">
                        <span>{quote.date || "—"}</span>
                        <span className="font-bold text-[#003d7a]">#{quote.quoteNumber || "—"}</span>
                      </div>
                      {quote.quotationCode && (
                        <div className="font-mono text-[9px] text-gray-400 mb-1">
                          {quote.quotationCode}
                        </div>
                      )}
                      <div className="text-lg font-bold text-[#003d7a] truncate mb-1">
                        {quote.client || "Untitled Client"}
                      </div>
                      <div className="text-xs font-black text-blue-600 mb-2">
                         {formatCurrency(quote.totalAmount)} <span className="text-gray-400 font-normal">(Incl. Tax)</span>
                      </div>
                      {quote.validUntil && (
                        <div className="text-xs text-gray-500 mb-2">
                          Valid until: {quote.validUntil}
                        </div>
                      )}

                      <div className="flex gap-2 mt-4 pt-2 border-t border-gray-100">
                        <Button size="sm" className="flex-1 bg-[#003d7a] hover:bg-[#002a5a]" onClick={() => onLoad(quote.id)}>
                          <FolderOpen className="w-3 h-3 mr-1" /> Open
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 border-[#e8b400] text-[#d4a200] hover:bg-[#fff9e6]" onClick={() => {
                          onLoad(quote.id);
                          setTimeout(() => window.print(), 350);
                        }}>
                          <Printer className="w-3 h-3 mr-1" /> PDF
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2" onClick={() => onDelete(quote.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}