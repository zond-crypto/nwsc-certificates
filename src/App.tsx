import React, { useState, useEffect } from 'react';
import logo from './assets/logo.png';
import { Certificate, Quotation, ServicePrice, RegulatoryLimit } from './types';
import { DEFAULT_PARAMS, DEFAULT_QUOTATION_ITEMS, PARAMETER_PRICES, INITIAL_REGULATORY_LIMITS } from './constants';
import { CertificateEditor } from './components/CertificateEditor';
import { SavedCertificates } from './components/SavedCertificates';
import { QuotationEditor } from './components/QuotationEditor';
import { SavedQuotations } from './components/SavedQuotations';
import { PriceListManager } from './components/PriceListManager';
import { RegulatoryManager } from './components/RegulatoryManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Save, Printer, FileText, FolderOpen, Database, ShieldCheck, Settings, Calculator, FileCheck } from 'lucide-react';
import { Toaster, toast } from 'sonner';

type AppModule = 'certificates' | 'quotations';

// ── Helpers ──────────────────────────────────────────────────────────
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

function normaliseCert(cert: Certificate): Certificate {
  const sampleCount = cert.samples.length;
  return {
    ...cert,
    tableData: cert.tableData.map(row => {
      if (row.section) return { ...row, results: [] };
      const results = Array.from({ length: sampleCount }, (_, i) => row.results[i] ?? '');
      return { ...row, results };
    })
  };
}

function generateNewQuotation(count: number): Quotation {
  const items = JSON.parse(JSON.stringify(DEFAULT_QUOTATION_ITEMS));
  const subtotal = items.reduce((sum: number, i: any) => sum + (i.amount || 0), 0);
  const totalTax = subtotal * 0.16;
  return {
    id: Date.now().toString(),
    quoteNumber: `QT-${String(count + 1).padStart(3, "0")}`,
    client: "",
    clientAddress: "",
    date: new Date().toISOString().slice(0, 10),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    items: items,
    subtotal: subtotal,
    totalTax: totalTax,
    totalAmount: subtotal + totalTax,
    sign1Name: "BENJAMIN MACHUTA",
    sign1Title: "SHEQ MANAGER",
    sign2Name: "",
    sign2Title: "LABORATORY TECHNOLOGIST",
    savedAt: new Date().toISOString()
  };
}

export default function App() {
  const [activeModule, setActiveModule] = useState<AppModule>('certificates');
  const [activeTab, setActiveTab] = useState("editor");

  const [savedCerts, setSavedCerts] = useState<Certificate[]>([]);
  const [currentCert, setCurrentCert] = useState<Certificate>(generateNewCertificate(0));
  const [savedQuotations, setSavedQuotations] = useState<Quotation[]>([]);
  const [currentQuotation, setCurrentQuotation] = useState<Quotation>(generateNewQuotation(0));
  const [priceList, setPriceList] = useState<ServicePrice[]>([]);
  const [regLimits, setRegLimits] = useState<RegulatoryLimit[]>([]);

  // ── Load / Save persistence ──
  useEffect(() => {
    try {
      const storedCerts = localStorage.getItem("nkana_certs");
      if (storedCerts) setSavedCerts(JSON.parse(storedCerts).map(normaliseCert));
      const storedQuotes = localStorage.getItem("nkana_quotes");
      if (storedQuotes) setSavedQuotations(JSON.parse(storedQuotes));
      const storedPrices = localStorage.getItem("nkana_prices");
      if (storedPrices) setPriceList(JSON.parse(storedPrices));
      else setPriceList(PARAMETER_PRICES.map((p, i) => ({ id: `p${i}`, ...p })));
      const storedLimits = localStorage.getItem("nkana_limits");
      if (storedLimits) setRegLimits(JSON.parse(storedLimits));
      else setRegLimits(INITIAL_REGULATORY_LIMITS);
    } catch (e) { console.error("Persistence fail", e); }
  }, []);

  useEffect(() => {
    localStorage.setItem("nkana_prices", JSON.stringify(priceList));
  }, [priceList]);

  useEffect(() => {
    localStorage.setItem("nkana_limits", JSON.stringify(regLimits));
  }, [regLimits]);

  const saveCertsToStorage = (certs: Certificate[]) => { 
    localStorage.setItem("nkana_certs", JSON.stringify(certs)); 
    setSavedCerts(certs); 
  };
  const handleSaveCert = () => {
    const newCert = { ...currentCert, savedAt: new Date().toISOString() };
    const up = savedCerts.filter(c => c.id !== newCert.id);
    saveCertsToStorage([newCert, ...up]);
    setCurrentCert(newCert);
    toast.success("Certificate saved!");
  };

  const saveQuotesToStorage = (quotes: Quotation[]) => { 
    localStorage.setItem("nkana_quotes", JSON.stringify(quotes)); 
    setSavedQuotations(quotes); 
  };
  const handleSaveQuote = () => {
    const newQuote = { ...currentQuotation, savedAt: new Date().toISOString() };
    const up = savedQuotations.filter(q => q.id !== newQuote.id);
    saveQuotesToStorage([newQuote, ...up]);
    setCurrentQuotation(newQuote);
    toast.success("Quotation saved!");
  };

  const handleNew = () => {
    if (activeModule === 'certificates') setCurrentCert(generateNewCertificate(savedCerts.length));
    else setCurrentQuotation(generateNewQuotation(savedQuotations.length));
    setActiveTab("editor");
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] font-sans text-gray-900">
      {/* ── EXISTING DESIGN HEADER ── */}
      <header className="bg-[#003d7a] text-white sticky top-0 z-[100] shadow-md print:hidden">
        <div className="h-0.5 bg-gradient-to-r from-[#e8b400] via-[#ffd700] to-[#e8b400]" />
        <div className="max-w-[1440px] mx-auto px-4 h-16 flex items-center justify-between gap-4">
           {/* Brand (Logo Fixed) */}
           <div className="flex items-center gap-3">
              <img src={logo} alt="Logo" className="w-9 h-9 object-contain bg-white rounded-full p-0.5" />
              <div>
                 <h1 className="text-[10px] font-black uppercase tracking-widest text-[#e8b400] leading-none">NKANA WATER & SEWERAGE CO.</h1>
                 <p className="text-[13px] font-bold text-white/90 truncate">Laboratory Information Management</p>
              </div>
           </div>

           {/* Module Switcher (Professional Tab Style) */}
           <div className="flex bg-black/20 p-1 rounded-lg">
              <button 
                onClick={() => { setActiveModule('certificates'); setActiveTab('editor'); }} 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeModule === 'certificates' ? 'bg-[#e8b400] text-[#1a1a00]' : 'hover:bg-white/10 text-white/70'}`}
              >
                <FileCheck className="w-3.5 h-3.5" /> <span className="hidden md:inline">Certificates</span>
              </button>
              <button 
                onClick={() => { setActiveModule('quotations'); setActiveTab('editor'); }} 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeModule === 'quotations' ? 'bg-[#e8b400] text-[#1a1a00]' : 'hover:bg-white/10 text-white/70'}`}
              >
                <Calculator className="w-3.5 h-3.5" /> <span className="hidden md:inline">Quotations</span>
              </button>
           </div>

           {/* Actions */}
           <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={handleNew} className="text-white hover:bg-white/20 border border-white/20 h-8 px-2.5 text-xs"><Plus className="w-3.5 h-3.5 sm:mr-1" /> New</Button>
              <Button variant="ghost" size="sm" onClick={activeModule === 'certificates' ? handleSaveCert : handleSaveQuote} className="text-white hover:bg-white/20 border border-white/20 h-8 px-2.5 text-xs"><Save className="w-3.5 h-3.5" /></Button>
              <Button variant="secondary" size="sm" onClick={() => window.print()} className="bg-[#e8b400] text-[#1a1a00] hover:bg-[#d4a200] h-8 px-2.5 text-xs font-semibold"><Printer className="w-3.5 h-3.5" /></Button>
           </div>
        </div>
      </header>

      <main className="max-w-[1240px] mx-auto p-4 md:p-6 pb-24 print:p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 bg-[#003d7a]/5 print:hidden">
            <TabsTrigger value="editor" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]"><FileText className="w-4 h-4 mr-2" /> Editor</TabsTrigger>
            <TabsTrigger value="saved" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]"><FolderOpen className="w-4 h-4 mr-2" /> Saved Items</TabsTrigger>
            {activeModule === 'certificates' && (
              <TabsTrigger value="regulatory" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]"><ShieldCheck className="w-4 h-4 mr-2" /> Standards DB</TabsTrigger>
            )}
            {activeModule === 'quotations' && (
              <TabsTrigger value="database" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]"><Database className="w-4 h-4 mr-2" /> Price List</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="editor" className="mt-0 print:m-0">
            {activeModule === 'certificates' ? (
              <CertificateEditor certificate={currentCert} setCertificate={setCurrentCert} onSave={handleSaveCert} regLimits={regLimits} />
            ) : (
              <QuotationEditor quotation={currentQuotation} setQuotation={setCurrentQuotation} onSave={handleSaveQuote} priceList={priceList} />
            )}
          </TabsContent>

          <TabsContent value="saved" className="mt-0 print:hidden">
            {activeModule === 'certificates' ? (
              <SavedCertificates certificates={savedCerts} onLoad={(id) => { const cert = savedCerts.find(c => c.id === id); if (cert) { setCurrentCert(normaliseCert({ ...cert })); setActiveTab("editor"); } }} onDelete={(id) => { if (confirm("Delete?")) { const up = savedCerts.filter(c => c.id !== id); saveCertsToStorage(up); if (currentCert.id === id) handleNew(); } }} onClearAll={() => { if (confirm("Clear?")) saveCertsToStorage([]); }} />
            ) : (
              <SavedQuotations quotations={savedQuotations} onLoad={(id) => { const q = savedQuotations.find(q => q.id === id); if (q) { setCurrentQuotation({ ...q }); setActiveTab("editor"); } }} onDelete={(id) => { if (confirm("Delete?")) { const up = savedQuotations.filter(q => q.id !== id); saveQuotesToStorage(up); if (currentQuotation.id === id) handleNew(); } }} onClearAll={() => { if (confirm("Clear?")) saveQuotesToStorage([]); }} />
            )}
          </TabsContent>

          <TabsContent value="regulatory" className="mt-0 print:hidden">
            <RegulatoryManager limits={regLimits} setLimits={setRegLimits} onReset={() => { if (confirm("Reset?")) setRegLimits(INITIAL_REGULATORY_LIMITS); }} />
          </TabsContent>

          <TabsContent value="database" className="mt-0 print:hidden">
            <PriceListManager priceList={priceList} setPriceList={setPriceList} onResetToDefault={() => { if (confirm("Reset?")) { setPriceList(PARAMETER_PRICES.map((p, i) => ({ id: `p${i}`, ...p }))); } }} />
          </TabsContent>
        </Tabs>
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}
