import React, { useEffect, useState } from 'react';
import { Certificate, Quotation, RegulatoryLimit, ServicePrice, Signature } from './types';
import { DEFAULT_PARAMS, DEFAULT_QUOTATION_ITEMS, INITIAL_REGULATORY_LIMITS, PARAMETER_PRICES } from './constants';
import { validateCertificate, validateQuotation, formatValidationErrors } from './utils/validation';
import { calculateExpiryDate, generateQuotationCode } from './utils/quotationUtils';
import { dedupeRegulatoryLimits } from './utils/standardsFetcher';
import { CertificateEditor } from './components/CertificateEditor';
import { SavedCertificates } from './components/SavedCertificates';
import { QuotationEditor } from './components/QuotationEditor';
import { SavedQuotations } from './components/SavedQuotations';
import { PriceListManager } from './components/PriceListManager';
import { RegulatoryManager } from './components/RegulatoryManager';
import { SignatureManager } from './components/SignatureManager';
import { loadSignatures, saveSignatures } from './utils/signatures';
import { generateCOAPdf, generateQuotationPdf } from './utils/pdfGenerators';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Save, Printer, FileText, FolderOpen, Database, ShieldCheck, Calculator, FileCheck } from 'lucide-react';
import { Toaster, toast } from 'sonner';

type AppModule = 'certificates' | 'quotations';

const CERTS_STORAGE_KEY = 'nkana_certs';
const QUOTES_STORAGE_KEY = 'nkana_quotes';
const PRICES_STORAGE_KEY = 'nkana_prices';
const LIMITS_STORAGE_KEY = 'nkana_limits';

function getNextDocumentNumber(documentNumbers: string[], prefix: 'WAC' | 'QT') {
  const maxValue = documentNumbers.reduce((highest, value) => {
    const match = value?.match(/(\d+)(?!.*\d)/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);

  return `${prefix}-${String(maxValue + 1).padStart(3, '0')}`;
}

function stripSavedAt<T extends { savedAt: string }>(document: T) {
  const { savedAt, ...rest } = document;
  return rest;
}

function hasDocumentChanged<T extends { savedAt: string }>(current: T, existing?: T) {
  if (!existing) return true;
  return JSON.stringify(stripSavedAt(current)) !== JSON.stringify(stripSavedAt(existing));
}

function generateNewCertificate(certNumber: string): Certificate {
  return {
    id: Date.now().toString(),
    certNumber,
    client: '',
    clientPhone: '',
    clientEmail: '',
    sampleType: 'Drinking Water',
    dateSampled: new Date().toISOString().slice(0, 10),
    dateReported: new Date().toISOString().slice(0, 10),
    location: '',
    samples: ['Sample 1'],
    sign1Name: 'BENJAMIN MACHUTA',
    sign1Title: 'SHEQ MANAGER',
    sign2Name: '',
    sign2Title: 'QUALITY ASSURANCE OFFICER',
    tableData: JSON.parse(JSON.stringify(DEFAULT_PARAMS)),
    savedAt: new Date().toISOString(),
  };
}

function normaliseCert(cert: Certificate): Certificate {
  const sampleCount = cert.samples.length;
  return {
    ...cert,
    tableData: cert.tableData.map(row => {
      if (row.section) return { ...row, results: [] };
      const results = Array.from({ length: sampleCount }, (_, index) => row.results[index] ?? '');
      return { ...row, results };
    }),
  };
}

function generateNewQuotation(quoteNumber: string): Quotation {
  const items = JSON.parse(JSON.stringify(DEFAULT_QUOTATION_ITEMS));
  const subtotal = items.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const totalTax = subtotal * 0.16;
  const issueDate = new Date();
  const expiryDate = calculateExpiryDate(issueDate);

  return {
    id: Date.now().toString(),
    quoteNumber,
    quotationCode: undefined,
    client: '',
    clientPhone: '',
    clientEmail: '',
    clientAddress: '',
    date: issueDate.toISOString().slice(0, 10),
    validUntil: expiryDate.toISOString().slice(0, 10),
    expiryDate: expiryDate.toISOString(),
    items,
    samples: [],
    subtotal,
    totalTax,
    totalAmount: subtotal + totalTax,
    sign1Name: 'BENJAMIN MACHUTA',
    sign1Title: 'SHEQ MANAGER',
    sign2Name: '',
    sign2Title: 'LABORATORY TECHNOLOGIST',
    savedAt: new Date().toISOString(),
    status: 'draft',
  };
}

export default function App() {
  const [activeModule, setActiveModule] = useState<AppModule>('certificates');
  const [activeTab, setActiveTab] = useState('editor');
  const [hasHydrated, setHasHydrated] = useState(false);

  const [savedCerts, setSavedCerts] = useState<Certificate[]>([]);
  const [currentCert, setCurrentCert] = useState<Certificate>(generateNewCertificate('WAC-001'));
  const [savedQuotations, setSavedQuotations] = useState<Quotation[]>([]);
  const [currentQuotation, setCurrentQuotation] = useState<Quotation>(generateNewQuotation('QT-001'));
  const [priceList, setPriceList] = useState<ServicePrice[]>([]);
  const [regLimits, setRegLimits] = useState<RegulatoryLimit[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [autoSaveEnabled] = useState(true);

  useEffect(() => {
    try {
      const parsedCerts: Certificate[] = (() => {
        const stored = localStorage.getItem(CERTS_STORAGE_KEY);
        return stored ? JSON.parse(stored).map(normaliseCert) : [];
      })();
      const parsedQuotes: Quotation[] = (() => {
        const stored = localStorage.getItem(QUOTES_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
      })();
      const storedPrices = localStorage.getItem(PRICES_STORAGE_KEY);
      const storedLimits = localStorage.getItem(LIMITS_STORAGE_KEY);

      setSavedCerts(parsedCerts);
      setSavedQuotations(parsedQuotes);
      setCurrentCert(generateNewCertificate(getNextDocumentNumber(parsedCerts.map(cert => cert.certNumber), 'WAC')));
      setCurrentQuotation(generateNewQuotation(getNextDocumentNumber(parsedQuotes.map(quote => quote.quoteNumber), 'QT')));
      setPriceList(storedPrices ? JSON.parse(storedPrices) : PARAMETER_PRICES.map((price, index) => ({ id: `p${index}`, ...price })));
      setRegLimits(storedLimits ? dedupeRegulatoryLimits(JSON.parse(storedLimits)) : INITIAL_REGULATORY_LIMITS);
      setSignatures(loadSignatures());
    } catch (error) {
      console.error('Persistence fail', error);
      setPriceList(PARAMETER_PRICES.map((price, index) => ({ id: `p${index}`, ...price })));
      setRegLimits(INITIAL_REGULATORY_LIMITS);
    } finally {
      setHasHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    localStorage.setItem(PRICES_STORAGE_KEY, JSON.stringify(priceList));
  }, [hasHydrated, priceList]);

  useEffect(() => {
    if (!hasHydrated) return;
    localStorage.setItem(LIMITS_STORAGE_KEY, JSON.stringify(dedupeRegulatoryLimits(regLimits)));
  }, [hasHydrated, regLimits]);

  useEffect(() => {
    if (!hasHydrated) return;
    saveSignatures(signatures);
  }, [hasHydrated, signatures]);

  useEffect(() => {
    if (!hasHydrated) return;
    localStorage.setItem(CERTS_STORAGE_KEY, JSON.stringify(savedCerts));
  }, [hasHydrated, savedCerts]);

  useEffect(() => {
    if (!hasHydrated) return;
    localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(savedQuotations));
  }, [hasHydrated, savedQuotations]);

  useEffect(() => {
    if (!autoSaveEnabled || !hasHydrated) return;

    const timer = setTimeout(() => {
      const normalizedCurrent = normaliseCert(currentCert);
      setSavedCerts(prev => {
        const existing = prev.find(cert => cert.id === normalizedCurrent.id);
        if (!hasDocumentChanged(normalizedCurrent, existing ? normaliseCert(existing) : undefined)) {
          return prev;
        }

        const autoCert = { ...normalizedCurrent, savedAt: new Date().toISOString() };
        return [autoCert, ...prev.filter(cert => cert.id !== autoCert.id)];
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, [autoSaveEnabled, currentCert, hasHydrated]);

  useEffect(() => {
    if (!autoSaveEnabled || !hasHydrated) return;

    const timer = setTimeout(() => {
      setSavedQuotations(prev => {
        const existing = prev.find(quote => quote.id === currentQuotation.id);
        if (!hasDocumentChanged(currentQuotation, existing)) {
          return prev;
        }

        const autoQuote = { ...currentQuotation, savedAt: new Date().toISOString() };
        return [autoQuote, ...prev.filter(quote => quote.id !== autoQuote.id)];
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, [autoSaveEnabled, currentQuotation, hasHydrated]);

  const updateSavedCerts = (certs: Certificate[]) => {
    setSavedCerts(certs);
  };

  const updateSavedQuotations = (quotes: Quotation[]) => {
    setSavedQuotations(quotes);
  };

  const handleSaveCert = () => {
    const errors = validateCertificate(currentCert);
    if (errors.length > 0) {
      toast.error(formatValidationErrors(errors));
      return;
    }

    const newCert = { ...normaliseCert(currentCert), savedAt: new Date().toISOString() };
    const updated = [newCert, ...savedCerts.filter(cert => cert.id !== newCert.id)];
    updateSavedCerts(updated);
    setCurrentCert(newCert);
    toast.success('Certificate saved successfully!');
  };

  const handleSaveQuote = async (): Promise<boolean> => {
    const errors = validateQuotation(currentQuotation);
    if (errors.length > 0) {
      toast.error(formatValidationErrors(errors));
      return false;
    }

    let quotationCode = currentQuotation.quotationCode;
    if (!quotationCode) {
      const getLastSequenceForMonth = async (yearMonth: string) => {
        const existingCodes = savedQuotations
          .filter(quote => quote.quotationCode?.startsWith(`QT-${yearMonth}`))
          .map(quote => {
            const match = quote.quotationCode?.match(/QT-\d{6}-(\d{4})/);
            return match ? parseInt(match[1], 10) : 0;
          });
        return existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
      };

      quotationCode = await generateQuotationCode(getLastSequenceForMonth, new Date(currentQuotation.date));
    }

    if (quotationCode) {
      const existing = savedQuotations.find(q => q.quotationCode === quotationCode && q.id !== currentQuotation.id);
      if (existing) {
        toast.error(`A quotation with code ${quotationCode} already exists. Save blocked.`);
        return false;
      }
    }

    const resolvedExpiryDate = currentQuotation.validUntil
      ? new Date(`${currentQuotation.validUntil}T23:59:59`).toISOString()
      : currentQuotation.expiryDate || calculateExpiryDate(new Date(currentQuotation.date)).toISOString();

    const newQuote = {
      ...currentQuotation,
      quotationCode,
      expiryDate: resolvedExpiryDate,
      validUntil: resolvedExpiryDate.slice(0, 10),
      savedAt: new Date().toISOString(),
    };

    const updated = [newQuote, ...savedQuotations.filter(quote => quote.id !== newQuote.id)];
    updateSavedQuotations(updated);
    setCurrentQuotation(newQuote);
    toast.success('Quotation saved successfully!');
    return true;
  };

  const handleNew = () => {
    if (activeModule === 'certificates') {
      setCurrentCert(generateNewCertificate(getNextDocumentNumber(savedCerts.map(cert => cert.certNumber), 'WAC')));
    } else {
      setCurrentQuotation(generateNewQuotation(getNextDocumentNumber(savedQuotations.map(quote => quote.quoteNumber), 'QT')));
    }
    setActiveTab('editor');
  };

  const handleGlobalPrint = async () => {
    if (activeTab === 'editor') {
      try {
        if (activeModule === 'certificates') {
          // Note: for certificates, the user only asked for auto-save on Quote PDF, but it's good practice.
          await generateCOAPdf(currentCert);
        } else {
          const success = await handleSaveQuote();
          if (!success) return;
          await generateQuotationPdf(currentQuotation);
        }
        toast.success('PDF downloaded!');
      } catch (error) {
        toast.error('PDF generation failed');
      }
      return;
    }

    window.print();
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6] font-sans text-gray-900">
      <header className="sticky top-0 z-[100] bg-[#003d7a] text-white shadow-md print:hidden">
        <div className="h-0.5 bg-gradient-to-r from-[#e8b400] via-[#ffd700] to-[#e8b400]" />
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Nkana Water Supply and Sanitation Company" className="h-9 w-9 rounded-full bg-white object-contain p-0.5" />
            <div>
              <h1 className="text-[10px] font-black uppercase leading-none tracking-widest text-[#e8b400]">NKANA WATER SUPPLY & SANITATION CO.</h1>
              <p className="truncate text-[13px] font-bold text-white/90">Laboratory Information Management</p>
            </div>
          </div>

          <div className="flex rounded-lg bg-black/20 p-1">
            <button
              onClick={() => {
                setActiveModule('certificates');
                setActiveTab('editor');
              }}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${activeModule === 'certificates' ? 'bg-[#e8b400] text-[#1a1a00]' : 'text-white/70 hover:bg-white/10'}`}
            >
              <FileCheck className="h-3.5 w-3.5" /> <span className="hidden md:inline">Certificates</span>
            </button>
            <button
              onClick={() => {
                setActiveModule('quotations');
                setActiveTab('editor');
              }}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${activeModule === 'quotations' ? 'bg-[#e8b400] text-[#1a1a00]' : 'text-white/70 hover:bg-white/10'}`}
            >
              <Calculator className="h-3.5 w-3.5" /> <span className="hidden md:inline">Quotations</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={handleNew} className="h-8 border border-white/20 px-2.5 text-xs text-white hover:bg-white/20">
              <Plus className="h-3.5 w-3.5 sm:mr-1" /> New
            </Button>
            <Button variant="ghost" size="sm" onClick={activeModule === 'certificates' ? handleSaveCert : handleSaveQuote} className="h-8 border border-white/20 px-2.5 text-xs text-white hover:bg-white/20">
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button variant="secondary" size="sm" onClick={handleGlobalPrint} className="h-8 bg-[#e8b400] px-2.5 text-xs font-semibold text-[#1a1a00] hover:bg-[#d4a200]">
              <Printer className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] p-4 pb-24 md:p-6 print:p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 bg-[#003d7a]/5 print:hidden">
            <TabsTrigger value="editor" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]">
              <FileText className="mr-2 h-4 w-4" /> Editor
            </TabsTrigger>
            <TabsTrigger value="saved" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]">
              <FolderOpen className="mr-2 h-4 w-4" /> Saved Items
            </TabsTrigger>
            {activeModule === 'certificates' ? (
              <>
                <TabsTrigger value="regulatory" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]">
                  <ShieldCheck className="mr-2 h-4 w-4" /> Standards DB
                </TabsTrigger>
                <TabsTrigger value="signatures" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]">
                  <ShieldCheck className="mr-2 h-4 w-4" /> Digital Signatures
                </TabsTrigger>
              </>
            ) : (
              <TabsTrigger value="database" className="data-[state=active]:bg-white data-[state=active]:text-[#003d7a]">
                <Database className="mr-2 h-4 w-4" /> Price List
              </TabsTrigger>
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
              <SavedCertificates
                certificates={savedCerts}
                onLoad={(id) => {
                  const cert = savedCerts.find(item => item.id === id);
                  if (!cert) return;
                  setCurrentCert(normaliseCert({ ...cert }));
                  setActiveTab('editor');
                }}
                onDelete={(id) => {
                  if (!confirm('Delete?')) return;
                  const updated = savedCerts.filter(cert => cert.id !== id);
                  updateSavedCerts(updated);
                  if (currentCert.id === id) handleNew();
                }}
                onClearAll={() => {
                  if (!confirm('Clear?')) return;
                  updateSavedCerts([]);
                }}
              />
            ) : (
              <SavedQuotations
                quotations={savedQuotations}
                onLoad={(id) => {
                  const quotation = savedQuotations.find(item => item.id === id);
                  if (!quotation) return;
                  setCurrentQuotation({ ...quotation });
                  setActiveTab('editor');
                }}
                onDelete={(id) => {
                  if (!confirm('Delete?')) return;
                  const updated = savedQuotations.filter(quote => quote.id !== id);
                  updateSavedQuotations(updated);
                  if (currentQuotation.id === id) handleNew();
                }}
                onClearAll={() => {
                  if (!confirm('Clear?')) return;
                  updateSavedQuotations([]);
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="regulatory" className="mt-0 print:hidden">
            <RegulatoryManager limits={regLimits} setLimits={setRegLimits} onReset={() => { if (confirm('Reset?')) setRegLimits(INITIAL_REGULATORY_LIMITS); }} />
          </TabsContent>

          <TabsContent value="signatures" className="mt-0 print:hidden">
            <SignatureManager signatures={signatures} setSignatures={setSignatures} />
          </TabsContent>

          <TabsContent value="database" className="mt-0 print:hidden">
            <PriceListManager priceList={priceList} setPriceList={setPriceList} onResetToDefault={() => { if (confirm('Reset?')) { setPriceList(PARAMETER_PRICES.map((price, index) => ({ id: `p${index}`, ...price }))); } }} />
          </TabsContent>
        </Tabs>
      </main>

      <Toaster position="bottom-right" />
    </div>
  );
}
