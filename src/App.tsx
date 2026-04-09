import React, { useState, useEffect } from 'react';
import { Certificate, Quotation, ServicePrice, RegulatoryLimit } from './types';
import { DEFAULT_PARAMS, DEFAULT_QUOTATION_ITEMS, PARAMETER_PRICES, INITIAL_REGULATORY_LIMITS } from './constants';
import { validateCertificate, validateQuotation, formatValidationErrors } from './utils/validation';
import { generateQuotationCode, calculateExpiryDate } from './utils/quotationUtils';
import { CertificateEditor } from './components/CertificateEditor';
import { SavedCertificates } from './components/SavedCertificates';
import { QuotationEditor } from './components/QuotationEditor';
import { SavedQuotations } from './components/SavedQuotations';
import { PriceListManager } from './components/PriceListManager';
import { RegulatoryManager } from './components/RegulatoryManager';
import { SignatureManager } from './components/SignatureManager';
import { loadSignatures, saveSignatures } from './utils/signatures';
import { Signature } from './types';
import { generateCOAPdf, generateQuotationPdf } from './utils/pdfGenerators';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Save, Printer, FileText, FolderOpen, Database, ShieldCheck, Settings, Calculator, FileCheck, Droplets } from 'lucide-react';
import { Toaster, toast } from 'sonner';

type AppModule = 'certificates' | 'quotations';

// ── Helpers ──────────────────────────────────────────────────────────
function generateNewCertificate(count: number): Certificate {
  return {
    id: Date.now().toString(),
    certNumber: `WAC-${String(count + 1).padStart(3, "0")}`,
    client: "",
    clientPhone: "",
    clientEmail: "",
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
  const issueDate = new Date();
  const expiryDate = calculateExpiryDate(issueDate);

  return {
    id: Date.now().toString(),
    quoteNumber: `QT-${String(count + 1).padStart(3, "0")}`,
    quotationCode: undefined, // Will be generated on save
    client: "",
    clientPhone: "",
    clientEmail: "",
    clientAddress: "",
    date: issueDate.toISOString().slice(0, 10),
    validUntil: expiryDate.toISOString().slice(0, 10),
    expiryDate: expiryDate.toISOString(),
    items: items,
    samples: [],
    subtotal: subtotal,
    totalTax: totalTax,
    totalAmount: subtotal + totalTax,
    sign1Name: "BENJAMIN MACHUTA",
    sign1Title: "SHEQ MANAGER",
    sign2Name: "",
    sign2Title: "LABORATORY TECHNOLOGIST",
    savedAt: new Date().toISOString(),
    status: 'draft'
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
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

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
      setSignatures(loadSignatures());
    } catch (e) { console.error("Persistence fail", e); }
  }, []);

  useEffect(() => {
    localStorage.setItem("nkana_prices", JSON.stringify(priceList));
  }, [priceList]);

  useEffect(() => {
    saveSignatures(signatures);
  }, [signatures]);

  useEffect(() => {
    localStorage.setItem("nkana_limits", JSON.stringify(regLimits));
  }, [regLimits]);

  // ── Auto-save debounced (5 seconds) ──
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const timer = setTimeout(() => {
      const autoCert = { ...currentCert, savedAt: new Date().toISOString() };
      const existing = savedCerts.filter(c => c.id !== autoCert.id);
      localStorage.setItem("nkana_certs", JSON.stringify([autoCert, ...existing]));
    }, 5000);
    return () => clearTimeout(timer);
  }, [currentCert, autoSaveEnabled, savedCerts]);

  useEffect(() => {
    if (!autoSaveEnabled) return;
    const timer = setTimeout(() => {
      const autoQuote = { ...currentQuotation, savedAt: new Date().toISOString() };
      const existing = savedQuotations.filter(q => q.id !== autoQuote.id);
      localStorage.setItem("nkana_quotes", JSON.stringify([autoQuote, ...existing]));
    }, 5000);
    return () => clearTimeout(timer);
  }, [currentQuotation, autoSaveEnabled, savedQuotations]);

  const saveCertsToStorage = (certs: Certificate[]) => { 
    localStorage.setItem("nkana_certs", JSON.stringify(certs)); 
    setSavedCerts(certs); 
  };
  const handleSaveCert = () => {
    // Comprehensive validation
    const errors = validateCertificate(currentCert);
    if (errors.length > 0) {
      const errorMsg = formatValidationErrors(errors);
      toast.error(errorMsg);
      return;
    }
    
    const newCert = { ...currentCert, savedAt: new Date().toISOString() };
    const up = savedCerts.filter(c => c.id !== newCert.id);
    saveCertsToStorage([newCert, ...up]);
    setCurrentCert(newCert);
    toast.success("Certificate saved successfully!");
  };

  const saveQuotesToStorage = (quotes: Quotation[]) => { 
    localStorage.setItem("nkana_quotes", JSON.stringify(quotes)); 
    setSavedQuotations(quotes); 
  };
  const handleSaveQuote = async () => {
    // Comprehensive validation
    const errors = validateQuotation(currentQuotation);
    if (errors.length > 0) {
      const errorMsg = formatValidationErrors(errors);
      toast.error(errorMsg);
      return;
    }

    // Generate quotation code if not already set
    let quotationCode = currentQuotation.quotationCode;
    if (!quotationCode) {
      // Mock function to get last sequence - in real app this would query database
      const getLastSequenceForMonth = async (yearMonth: string) => {
        const existingCodes = savedQuotations
          .filter(q => q.quotationCode?.startsWith(`QT-${yearMonth}`))
          .map(q => {
            const match = q.quotationCode?.match(/QT-\d{6}-(\d{4})/);
            return match ? parseInt(match[1]) : 0;
          });
        return existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
      };

      quotationCode = await generateQuotationCode(getLastSequenceForMonth, new Date(currentQuotation.date));
    }

    // Calculate expiry date if not set
    const expiryDate = currentQuotation.expiryDate || calculateExpiryDate(new Date(currentQuotation.date)).toISOString();

    const newQuote = {
      ...currentQuotation,
      quotationCode,
      expiryDate,
      savedAt: new Date().toISOString()
    };

    const up = savedQuotations.filter(q => q.id !== newQuote.id);
    saveQuotesToStorage([newQuote, ...up]);
    setCurrentQuotation(newQuote);
    toast.success("Quotation saved successfully!");
  };

  const handleNew = () => {
    if (activeModule === 'certificates') setCurrentCert(normaliseCert(generateNewCertificate(savedCerts.length)));
    else setCurrentQuotation(generateNewQuotation(savedQuotations.length));
    setActiveTab("editor");
  };

  const handleGlobalPrint = async () => {
    if (activeTab === 'editor') {
      try {
        if (activeModule === 'certificates') {
          await generateCOAPdf(currentCert);
        } else {
          await generateQuotationPdf(currentQuotation);
        }
        toast.success('PDF downloaded!');
      } catch (err) {
        toast.error('PDF generation failed');
      }
    } else {
      window.print();
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] font-sans text-gray-900">
      {/* ── EXISTING DESIGN HEADER ── */}
      <header className="bg-[#003d7a] text-white sticky top-0 z-[100] shadow-md print:hidden">
        <div className="h-0.5 bg-gradient-to-r from-[#e8b400] via-[#ffd700] to-[#e8b400]" />
        <div className="max-w-[1440px] mx-auto px-4 h-16 flex items-center justify-between gap-4">
           {/* Brand (Logo Fixed) */}
           <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Nkana Water Supply and Sanitation Company" className="w-9 h-9 object-contain bg-white rounded-full p-0.5" />
              <div>
                 <h1 className="text-[10px] font-black uppercase tracking-widest text-[#e8b400] leading-none">NKANA WATER SUPPLY & SANITATION CO.</h1>
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
              <Button variant="secondary" size="sm" onClick={handleGlobalPrint} className="bg-[#e8b400] text-[#1a1a00] hover:bg-[#d4a200] h-8 px-2.5 text-xs font-semibold"><Printer className="w-3.5 h-3.5" /></Button>
           </div>
        </div>
      </header>

      <main className="max-w-[1240px] mx-auto p-4 md:p-6 pb-24 print:p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 bg-[#003d7a]/5 print:hidden">
            <TabsTrigger value="editor" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]"><FileText className="w-4 h-4 mr-2" /> Editor</TabsTrigger>
            <TabsTrigger value="saved" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]"><FolderOpen className="w-4 h-4 mr-2" /> Saved Items</TabsTrigger>
            {activeModule === 'certificates' && (
              <>

                <TabsTrigger value="regulatory" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]"><ShieldCheck className="w-4 h-4 mr-2" /> Standards DB</TabsTrigger>
                <TabsTrigger value="signatures" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]"><ShieldCheck className="w-4 h-4 mr-2" /> Digital Signatures</TabsTrigger>
              </>
            )}
            {activeModule === 'quotations' && (
              <TabsTrigger value="database" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]"><Database className="w-4 h-4 mr-2" /> Price List</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="editor" className="mt-0 print:m-0">
            {activeModule === 'certificates' ? (
              <CertificateEditor certificate={currentCert} setCertificate={setCurrentCert} onSave={handleSaveCert} regLimits={regLimits} signatures={signatures} />
            ) : (
              <QuotationEditor quotation={currentQuotation} setQuotation={setCurrentQuotation} onSave={handleSaveQuote} priceList={priceList} signatures={signatures} />
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

          <TabsContent value="signatures" className="mt-0 print:hidden">
            <SignatureManager signatures={signatures} setSignatures={setSignatures} />
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
