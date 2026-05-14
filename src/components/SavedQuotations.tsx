import React, { useState, useMemo } from 'react';
import { Quotation, Client } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, FolderOpen, Printer, Search, Folder, ChevronRight, ChevronDown, UserCheck, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { generateQuotationPdf } from '../utils/pdfGenerators';
import { getQuotationStatus } from '../utils/quotationUtils';

interface Props {
  quotations: Quotation[];
  clients: Client[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function SavedQuotations({ quotations, clients, onLoad, onDelete, onClearAll }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ 'root-contract': true, 'root-regular': true });

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isContractClient = (clientName: string) => {
    return clients.find(c => c.name.toLowerCase() === clientName.toLowerCase())?.isContract || false;
  };

  const groupedQuotes = useMemo(() => {
    const tree: any = {
      contract: {}, // { clientName: { year: { month: [] } } }
      regular: {}  // { year: { month: { clientName: [] } } }
    };

    const filtered = quotations.filter(quote =>
      quote.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quoteNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quotationCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.forEach(quote => {
      const date = new Date(quote.date);
      const year = date.getFullYear().toString();
      const month = date.toLocaleString('default', { month: 'long' });
      const client = quote.client || "Unknown Client";

      if (isContractClient(quote.client)) {
        if (!tree.contract[client]) tree.contract[client] = {};
        if (!tree.contract[client][year]) tree.contract[client][year] = {};
        if (!tree.contract[client][year][month]) tree.contract[client][year][month] = [];
        tree.contract[client][year][month].push(quote);
      } else {
        if (!tree.regular[year]) tree.regular[year] = {};
        if (!tree.regular[year][month]) tree.regular[year][month] = {};
        if (!tree.regular[year][month][client]) tree.regular[year][month][client] = [];
        tree.regular[year][month][client].push(quote);
      }
    });

    return tree;
  }, [quotations, clients, searchTerm]);

  const renderFolder = (label: string, key: string, content: React.ReactNode, icon: any = Folder, color: string = "text-blue-600") => {
    const isExpanded = expandedFolders[key];
    const Icon = icon;
    return (
      <div className="mb-1">
        <button 
          onClick={() => toggleFolder(key)}
          className="flex items-center gap-2 w-full p-1.5 hover:bg-gray-50 rounded-md transition-colors text-left"
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="font-semibold text-sm text-[#003d7a]">{label}</span>
        </button>
        {isExpanded && <div className="ml-4 mt-1 border-l border-gray-100 pl-3">{content}</div>}
      </div>
    );
  };

  if (quotations.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Calculator className="w-12 h-12 mx-auto mb-4 opacity-10" />
        <p>No saved quotations yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            placeholder="Search quotations..." 
            className="pl-10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="destructive" size="sm" onClick={onClearAll}>
          <Trash2 className="w-4 h-4 mr-2" /> Clear All
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4">
        {/* Contract Clients Folder */}
        {renderFolder("Contract Clients", "root-contract", (
          Object.keys(groupedQuotes.contract).length === 0 ? <p className="text-xs text-gray-400 py-2">No contract records</p> :
          Object.keys(groupedQuotes.contract).sort().map(client => (
            renderFolder(client, `contract-${client}`, (
              Object.keys(groupedQuotes.contract[client]).sort().reverse().map(year => (
                renderFolder(year, `contract-${client}-${year}`, (
                  Object.keys(groupedQuotes.contract[client][year]).map(month => (
                    renderFolder(month, `contract-${client}-${year}-${month}`, (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {groupedQuotes.contract[client][year][month].map((quote: Quotation) => (
                          <QuoteCard key={quote.id} quote={quote} onLoad={onLoad} onDelete={onDelete} />
                        ))}
                      </div>
                    ))
                  ))
                ))
              ))
            ), UserCheck, "text-green-600")
          ))
        ), UserCheck, "text-green-600")}

        {/* Regular Clients Folder */}
        {renderFolder("Regular Clients", "root-regular", (
          Object.keys(groupedQuotes.regular).length === 0 ? <p className="text-xs text-gray-400 py-2">No standard records</p> :
          Object.keys(groupedQuotes.regular).sort().reverse().map(year => (
            renderFolder(year, `regular-${year}`, (
              Object.keys(groupedQuotes.regular[year]).map(month => (
                renderFolder(month, `regular-${year}-${month}`, (
                   Object.keys(groupedQuotes.regular[year][month]).map(client => (
                      renderFolder(client, `regular-${year}-${month}-${client}`, (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {groupedQuotes.regular[year][month][client].map((quote: Quotation) => (
                            <QuoteCard key={quote.id} quote={quote} onLoad={onLoad} onDelete={onDelete} />
                          ))}
                        </div>
                      ))
                   ))
                ))
              ))
            ))
          ))
        ))}
      </div>
    </div>
  );
}

interface QuoteCardProps {
  quote: Quotation;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

function QuoteCard({ quote, onLoad, onDelete }: QuoteCardProps) {
  const formatCurrency = (val: number) => `K ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const statusInfo = quote.expiryDate ? getQuotationStatus(quote.expiryDate) : { status: 'active' };

  return (
    <div className={`bg-white border rounded-lg p-3 hover:shadow-md transition-shadow relative ${
      statusInfo.status === 'expired' ? 'border-red-100 bg-red-50/30' : ''
    }`}>
      <div className="flex justify-between items-start mb-1">
        <span className="text-[9px] font-mono font-bold text-blue-600">{quote.quotationCode || quote.quoteNumber}</span>
        {statusInfo.status === 'expired' && <span className="text-[8px] font-black text-red-600 uppercase">Expired</span>}
      </div>
      <div className="font-bold text-sm text-[#003d7a] truncate mb-0.5">{quote.client}</div>
      <div className="text-[11px] font-black text-blue-700 mb-2">{formatCurrency(quote.totalAmount)}</div>
      
      <div className="flex gap-2">
        <Button size="xs" className="flex-1 bg-[#003d7a] h-7 text-[10px]" onClick={() => onLoad(quote.id)}>Open</Button>
        <Button size="xs" variant="outline" className="h-7 text-[10px]" onClick={async () => {
          try { await generateQuotationPdf(quote); toast.success('Downloaded'); } catch (e) { toast.error('Failed'); }
        }}>PDF</Button>
        <button onClick={() => onDelete(quote.id)} className="text-gray-300 hover:text-red-500 p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}