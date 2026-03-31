import React, { useState, useMemo } from 'react';
import { Certificate } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, FolderOpen, Printer, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  certificates: Certificate[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function SavedCertificates({ certificates, onLoad, onDelete, onClearAll }: Props) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCerts = useMemo(() => {
    return certificates.filter(cert =>
      cert.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.certNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.sampleType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.location?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [certificates, searchTerm]);

  if (certificates.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
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
            placeholder="Search by client, cert #, type, or location..." 
            className="pl-10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="destructive" size="sm" onClick={onClearAll}>
          <Trash2 className="w-4 h-4 mr-2" /> Clear All
        </Button>
      </div>

      {filteredCerts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No certificates match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCerts.map(cert => (
            <div key={cert.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-[#0072ce] flex flex-col gap-2">
              <div className="font-mono text-xs text-gray-500 flex justify-between">
                <span>{cert.dateSampled || "—"}</span>
                <span>Cert #{cert.certNumber || "—"}</span>
              </div>
              <div className="text-lg font-bold text-[#003d7a] truncate">
                {cert.client || "Unknown Client"}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {cert.sampleType} &middot; {cert.location || "No location"}
              </div>
              
              <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                <Button size="sm" className="flex-1 bg-[#0072ce] hover:bg-[#0061b0]" onClick={() => onLoad(cert.id)}>
                  <FolderOpen className="w-3 h-3 mr-1" /> Open
                </Button>
                <Button size="sm" variant="outline" className="flex-1 border-[#e8b400] text-[#d4a200] hover:bg-[#fff9e6]" onClick={() => {
                  onLoad(cert.id);
                  setTimeout(() => window.print(), 300);
                }}>
                  <Printer className="w-3 h-3 mr-1" /> PDF
                </Button>
                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2" onClick={() => onDelete(cert.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}