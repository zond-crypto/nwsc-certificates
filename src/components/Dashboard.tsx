import React, { useState, useMemo } from 'react';
import { Client, Quotation, Certificate } from '../types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  BarChart, 
  Wallet, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Search, 
  TrendingUp, 
  Users,
  AlertCircle
} from 'lucide-react';

interface Props {
  clients: Client[];
  quotations: Quotation[];
  certificates: Certificate[];
}

export function Dashboard({ clients, quotations, certificates }: Props) {
  const [clientSearch, setClientSearch] = useState("");

  const stats = useMemo(() => {
    const totalRevenue = quotations.reduce((sum, q) => sum + (q.totalAmount || 0), 0);
    const pendingPayments = quotations.filter(q => !q.paymentStatus || q.paymentStatus === 'pending').length;
    const coasIssued = certificates.length;
    const awaitingCoa = quotations.filter(q => !certificates.some(c => c.linkedQuotationId === q.id)).length;

    return {
      totalRevenue,
      pendingPayments,
      coasIssued,
      awaitingCoa,
      totalQuotations: quotations.length
    };
  }, [quotations, certificates]);

  const financialReports = useMemo(() => {
    // Basic grouping by month for current year
    const now = new Date();
    const currentYear = now.getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => {
       const d = new Date(currentYear, i, 1);
       return {
         month: d.toLocaleString('default', { month: 'short' }),
         total: 0
       };
    });

    quotations.forEach(q => {
      const d = new Date(q.date);
      if (d.getFullYear() === currentYear) {
        months[d.getMonth()].total += q.totalAmount || 0;
      }
    });

    return months;
  }, [quotations]);

  const searchResults = useMemo(() => {
    if (!clientSearch.trim()) return null;
    const lowerSearch = clientSearch.toLowerCase();
    
    const matchedClients = clients.filter(c => c.name.toLowerCase().includes(lowerSearch));
    const matchedQuotes = quotations.filter(q => q.client.toLowerCase().includes(lowerSearch));
    const matchedCerts = certificates.filter(c => c.client.toLowerCase().includes(lowerSearch));

    return {
      clients: matchedClients,
      quotations: matchedQuotes,
      certificates: matchedCerts
    };
  }, [clientSearch, clients, quotations, certificates]);

  const formatCurrency = (val: number) => `K ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-[#003d7a] tracking-tight uppercase">System Dashboard</h2>
        <div className="text-xs font-bold text-gray-400">NKANA WATER LIMS v2.0</div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={Wallet} color="text-green-600" />
        <StatCard title="Quotations" value={stats.totalQuotations} icon={FileText} color="text-blue-600" />
        <StatCard title="COAs Issued" value={stats.coasIssued} icon={CheckCircle2} color="text-purple-600" />
        <StatCard title="Awaiting COA" value={stats.awaitingCoa} icon={Clock} color="text-orange-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Overview */}
        <div className="lg:col-span-2 shadow-sm border border-gray-100 rounded-xl bg-white overflow-hidden">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2 p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-500">Revenue Overview ({new Date().getFullYear()})</h3>
            <TrendingUp className="w-4 h-4 text-gray-400" />
          </div>
          <div className="p-6 pt-0">
            <div className="h-[200px] w-full flex items-end gap-2 pt-4">
              {financialReports.map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-2 group">
                  {(() => {
                    const maxTotal = Math.max(...financialReports.map(x => x.total)) || 1;
                    const height = Math.min(100, (m.total / maxTotal) * 100);
                    return (
                      <div 
                        className="w-full bg-[#003d7a]/10 group-hover:bg-[#003d7a]/20 rounded-t-md transition-all relative"
                        style={{ height: `${height}%` }}
                      >
                        {m.total > 0 && (
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-[#003d7a] opacity-0 group-hover:opacity-100 transition-opacity">
                            {Math.round(m.total/1000)}k
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <span className="text-[10px] font-bold text-gray-400">{m.month}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="shadow-sm border border-gray-100 rounded-xl bg-white overflow-hidden">
          <div className="p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-500 mb-4">Status Tracking</h3>
          </div>
          <div className="p-6 pt-0 space-y-4">
            <StatusRow label="Pending Payment" count={stats.pendingPayments} total={stats.totalQuotations} color="bg-orange-500" />
            <StatusRow label="Paid / Contract" count={stats.totalQuotations - stats.pendingPayments} total={stats.totalQuotations} color="bg-green-500" />
            <StatusRow label="Pending COA" count={stats.awaitingCoa} total={stats.totalQuotations} color="bg-blue-500" />
          </div>
        </div>
      </div>

      {/* Client Intelligence Search */}
      <div className="shadow-md border border-[#003d7a]/10 bg-gradient-to-br from-white to-blue-50/30 rounded-2xl overflow-hidden">
        <div className="p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-[#003d7a] flex items-center gap-2">
            <Users className="w-4 h-4" /> Client Intelligence Search
          </h3>
        </div>
        <div className="p-6 pt-0">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input 
              placeholder="Search all records associated with a client..." 
              className="pl-10 h-12 bg-white shadow-inner border-blue-100"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
            />
          </div>

          {searchResults ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               <SearchSection title="Clients" count={searchResults.clients.length}>
                  {searchResults.clients.map(c => (
                    <div key={c.id} className="p-2 border-b last:border-0 flex justify-between items-center">
                      <span className="text-sm font-bold text-[#003d7a]">{c.name}</span>
                      {c.isContract && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-black">CONTRACT</span>}
                    </div>
                  ))}
               </SearchSection>

               <SearchSection title="Quotations" count={searchResults.quotations.length}>
                  {searchResults.quotations.map(q => (
                    <div key={q.id} className="p-2 border-b last:border-0 flex flex-col">
                      <div className="flex justify-between">
                        <span className="text-[10px] font-mono text-blue-600">{q.quotationCode || q.quoteNumber}</span>
                        <span className="text-[10px] font-bold">{formatCurrency(q.totalAmount)}</span>
                      </div>
                      <span className="text-xs text-gray-500">{new Date(q.date).toLocaleDateString()}</span>
                    </div>
                  ))}
               </SearchSection>

               <SearchSection title="Certificates" count={searchResults.certificates.length}>
                  {searchResults.certificates.map(c => (
                    <div key={c.id} className="p-2 border-b last:border-0 flex flex-col">
                      <div className="flex justify-between">
                        <span className="text-[10px] font-mono text-purple-600">{c.certNumber}</span>
                        <span className="text-xs text-gray-500">{new Date(c.dateReported).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
               </SearchSection>
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-blue-100 rounded-2xl">
               <Users className="w-12 h-12 text-blue-100 mx-auto mb-2" />
               <p className="text-gray-400 text-sm">Enter a client name to retrieve persistent records</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: any) {
  return (
    <div className="shadow-sm border border-gray-100 rounded-xl bg-white overflow-hidden">
      <div className="p-5 flex items-center gap-4">
        <div className={`p-3 rounded-xl bg-gray-50 ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</p>
          <p className="text-xl font-black text-[#003d7a]">{value}</p>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, count, total, color }: any) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-bold text-gray-600">{label}</span>
        <span className="font-mono font-bold text-[#003d7a]">{count}</span>
      </div>
      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function SearchSection({ title, count, children }: any) {
  return (
    <div className="bg-white rounded-xl border border-blue-50 overflow-hidden shadow-sm">
      <div className="bg-[#003d7a] p-2 flex justify-between items-center">
        <span className="text-[10px] font-black text-white uppercase tracking-widest">{title}</span>
        <span className="text-[10px] font-black bg-white/20 text-white px-1.5 py-0.5 rounded">{count}</span>
      </div>
      <div className="p-2 max-h-[300px] overflow-y-auto">
        {count === 0 ? <p className="text-center py-8 text-[10px] text-gray-400 uppercase italic">No records found</p> : children}
      </div>
    </div>
  );
}
