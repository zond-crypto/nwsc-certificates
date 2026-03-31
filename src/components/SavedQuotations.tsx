import React, { useState, useMemo } from 'react';
import { Quotation } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, FolderOpen, Printer, Calculator, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  quotations: Quotation[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function SavedQuotations({ quotations, onLoad, onDelete, onClearAll }: Props) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredQuotations = useMemo(() => {
    return quotations.filter(quote =>
      quote.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quoteNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.clientAddress?.toLowerCase().includes(searchTerm.toLowerCase())
    );
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
            placeholder="Search by client, quote #, or address..." 
            className="pl-10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="destructive" size="sm" onClick={onClearAll}>
          <Trash2 className="w-4 h-4 mr-2" /> Clear All
        </Button>
      </div>

      {filteredQuotations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No quotations match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuotations.map(quote => (
            <div key={quote.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-[#e8b400] flex flex-col gap-2 relative overflow-hidden">
              <div className="font-mono text-[10px] text-gray-500 flex justify-between">
                <span>{quote.date || "—"}</span>
                <span className="font-bold text-[#003d7a]">#{quote.quoteNumber || "—"}</span>
              </div>
              <div className="text-lg font-bold text-[#003d7a] truncate">
                {quote.client || "Untitled Client"}
              </div>
              <div className="text-xs font-black text-blue-600">
                 {formatCurrency(quote.totalAmount)} <span className="text-gray-400 font-normal">(Incl. Tax)</span>
              </div>
              
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
          ))}
        </div>
      )}
    </div>
  );
}