import React, { useState, useMemo } from 'react';
import { Certificate, Client } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, FolderOpen, Printer, Search, Folder, ChevronRight, ChevronDown, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { generateCOAPdf } from '../utils/pdfGenerators';

interface Props {
  certificates: Certificate[];
  clients: Client[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function SavedCertificates({ certificates, clients, onLoad, onDelete, onClearAll }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ 'root-contract': true, 'root-regular': true });

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isContractClient = (clientName: string) => {
    return clients.find(c => c.name.toLowerCase() === clientName.toLowerCase())?.isContract || false;
  };

  const groupedCerts = useMemo(() => {
    const tree: any = {
      contract: {},
      regular: {}
    };

    const filtered = certificates.filter(cert =>
      cert.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.certNumber?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.forEach(cert => {
      const date = new Date(cert.savedAt || cert.dateReported);
      const year = date.getFullYear().toString();
      const month = date.toLocaleString('default', { month: 'long' });
      const type = isContractClient(cert.client) ? 'contract' : 'regular';

      if (!tree[type][year]) tree[type][year] = {};
      if (!tree[type][year][month]) tree[type][year][month] = [];
      
      tree[type][year][month].push(cert);
    });

    return tree;
  }, [certificates, clients, searchTerm]);

  const renderFolder = (label: string, key: string, content: React.ReactNode, icon: any = Folder) => {
    const isExpanded = expandedFolders[key];
    const Icon = icon;
    return (
      <div className="mb-2">
        <button 
          onClick={() => toggleFolder(key)}
          className="flex items-center gap-2 w-full p-2 hover:bg-blue-50 rounded-lg transition-colors text-left"
        >
          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <Icon className={`w-5 h-5 ${key.includes('contract') ? 'text-green-600' : 'text-blue-600'}`} />
          <span className="font-bold text-[#003d7a]">{label}</span>
        </button>
        {isExpanded && <div className="ml-6 mt-1 border-l-2 border-gray-100 pl-4">{content}</div>}
      </div>
    );
  };

  if (certificates.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Folder className="w-12 h-12 mx-auto mb-4 opacity-10" />
        <p>No saved certificates yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            placeholder="Search saved COAs..." 
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
          Object.keys(groupedCerts.contract).length === 0 ? <p className="text-xs text-gray-400 py-2">No contract records</p> :
          Object.keys(groupedCerts.contract).sort().reverse().map(year => (
            renderFolder(year, `contract-${year}`, (
              Object.keys(groupedCerts.contract[year]).map(month => (
                renderFolder(month, `contract-${year}-${month}`, (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {groupedCerts.contract[year][month].map((cert: Certificate) => (
                      <CertCard key={cert.id} cert={cert} onLoad={onLoad} onDelete={onDelete} />
                    ))}
                  </div>
                ))
              ))
            ))
          ))
        ), UserCheck)}

        {/* Regular COAs Folder */}
        {renderFolder("Standard COAs", "root-regular", (
          Object.keys(groupedCerts.regular).length === 0 ? <p className="text-xs text-gray-400 py-2">No standard records</p> :
          Object.keys(groupedCerts.regular).sort().reverse().map(year => (
            renderFolder(year, `regular-${year}`, (
              Object.keys(groupedCerts.regular[year]).map(month => (
                renderFolder(month, `regular-${year}-${month}`, (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {groupedCerts.regular[year][month].map((cert: Certificate) => (
                      <CertCard key={cert.id} cert={cert} onLoad={onLoad} onDelete={onDelete} />
                    ))}
                  </div>
                ))
              ))
            ))
          ))
        ))}
      </div>
    </div>
  );
}

interface CertCardProps {
  cert: Certificate;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

function CertCard({ cert, onLoad, onDelete }: CertCardProps) {
  return (
    <div className="bg-white border rounded-lg p-3 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{cert.certNumber}</span>
        <span className="text-[9px] text-gray-400">{new Date(cert.savedAt || cert.dateReported).toLocaleDateString()}</span>
      </div>
      <div className="font-bold text-sm text-[#003d7a] truncate mb-1">{cert.client}</div>
      <div className="text-[10px] text-gray-500 mb-3">{cert.sampleType}</div>
      
      <div className="flex gap-2">
        <Button size="xs" className="flex-1 bg-[#003d7a] h-7 text-[10px]" onClick={() => onLoad(cert.id)}>Open</Button>
        <Button size="xs" variant="outline" className="h-7 text-[10px]" onClick={async () => {
          try { await generateCOAPdf(cert); toast.success('Downloaded'); } catch (e) { toast.error('Failed'); }
        }}>PDF</Button>
        <button onClick={() => onDelete(cert.id)} className="text-gray-300 hover:text-red-500 p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}