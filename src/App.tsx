import React, { useState, useEffect } from 'react';
import { Certificate } from './types';
import { DEFAULT_PARAMS } from './constants';
import { CertificateEditor } from './components/CertificateEditor';
import { SavedCertificates } from './components/SavedCertificates';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Save, Printer, Download, FileText, FolderOpen } from 'lucide-react';
import { Toaster, toast } from 'sonner';

function generateNewCertificate(count: number): Certificate {
  return {
    id: Date.now().toString(),
    certNumber: `WAC-${String(count + 1).padStart(3, "0")}`,
    client: "",
    sampleType: "Drinking Water",
    dateSampled: new Date().toISOString().slice(0, 10),
    dateReported: new Date().toISOString().slice(0, 10),
    location: "",
    samples: ["Sample 1"],
    sign1Name: "BENJAMIN MACHUTA",
    sign1Title: "SHEQ MANAGER",
    sign2Name: "",
    sign2Title: "QUALITY ASSURANCE OFFICER",
    tableData: JSON.parse(JSON.stringify(DEFAULT_PARAMS)),
    savedAt: new Date().toISOString()
  };
}

export default function App() {
  const [savedCerts, setSavedCerts] = useState<Certificate[]>([]);
  const [currentCert, setCurrentCert] = useState<Certificate>(generateNewCertificate(0));
  const [activeTab, setActiveTab] = useState("editor");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("nkana_certs");
      if (stored) {
        const parsed = JSON.parse(stored);
        setSavedCerts(parsed);
        if (parsed.length > 0) {
          setCurrentCert(generateNewCertificate(parsed.length));
        }
      }
    } catch (e) {
      console.error("Failed to load certs from local storage", e);
    }
  }, []);

  const saveCertsToStorage = (certs: Certificate[]) => {
    localStorage.setItem("nkana_certs", JSON.stringify(certs));
    setSavedCerts(certs);
  };

  const handleSave = () => {
    const newCert = { ...currentCert, savedAt: new Date().toISOString() };
    const existingIdx = savedCerts.findIndex(c => c.id === newCert.id);
    
    let updatedCerts;
    if (existingIdx >= 0) {
      updatedCerts = [...savedCerts];
      updatedCerts[existingIdx] = newCert;
    } else {
      updatedCerts = [newCert, ...savedCerts];
    }
    
    saveCertsToStorage(updatedCerts);
    setCurrentCert(newCert);
    toast.success("Certificate saved successfully!");
  };

  const handleNew = () => {
    setCurrentCert(generateNewCertificate(savedCerts.length));
    setActiveTab("editor");
    toast.info("Started new certificate");
  };

  const handleLoad = (id: string) => {
    const cert = savedCerts.find(c => c.id === id);
    if (cert) {
      setCurrentCert({ ...cert });
      setActiveTab("editor");
      toast.success("Certificate loaded!");
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Delete this certificate?")) {
      const updated = savedCerts.filter(c => c.id !== id);
      saveCertsToStorage(updated);
      if (currentCert.id === id) {
        handleNew();
      }
      toast.success("Certificate deleted");
    }
  };

  const handleClearAll = () => {
    if (confirm("Delete ALL saved certificates? This cannot be undone.")) {
      saveCertsToStorage([]);
      toast.success("All certificates cleared");
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f4f9] font-sans text-[#1a2635]">
      {/* App Bar */}
      <div className="bg-[#003d7a] text-white px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-md print:hidden">
        <div className="text-sm font-bold tracking-wider opacity-90 flex items-center gap-2">
          <span className="text-xl">⚗️</span> NKANA WATER — Certificate of Analysis System
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleNew} className="text-white hover:bg-white/20 border border-white/25">
            <Plus className="w-4 h-4 mr-1" /> New
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} className="text-white hover:bg-white/20 border border-white/25">
            <Save className="w-4 h-4 mr-1" /> Save
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()} className="bg-[#e8b400] text-black hover:bg-[#d4a200] border-none">
            <Printer className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto p-4 md:p-6 pb-24 print:p-0 print:max-w-none">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 bg-[#003d7a]/5 print:hidden">
            <TabsTrigger value="editor" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a] data-[state=active]:shadow-sm">
              <FileText className="w-4 h-4 mr-2" /> Certificate Editor
            </TabsTrigger>
            <TabsTrigger value="saved" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a] data-[state=active]:shadow-sm">
              <FolderOpen className="w-4 h-4 mr-2" /> Saved Certificates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="mt-0 print:m-0">
            <CertificateEditor 
              certificate={currentCert} 
              setCertificate={setCurrentCert} 
              onSave={handleSave}
            />
          </TabsContent>

          <TabsContent value="saved" className="mt-0 print:hidden">
            <SavedCertificates 
              certificates={savedCerts} 
              onLoad={handleLoad} 
              onDelete={handleDelete} 
              onClearAll={handleClearAll}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}
