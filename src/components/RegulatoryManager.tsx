import React, { useState } from 'react';
import { RegulatoryLimit } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Printer, ShieldCheck, RefreshCw, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchZABSStandards,
  fetchZEMAStandards,
  getCachedStandards,
  clearStandardsCache,
  getCacheInfo,
  exportStandardsAsJSON,
  importStandardsFromJSON
} from '../utils/standardsFetcher';

interface Props {
  limits: RegulatoryLimit[];
  setLimits: React.Dispatch<React.SetStateAction<RegulatoryLimit[]>>;
  onReset: () => void;
}

export function RegulatoryManager({ limits, setLimits, onReset }: Props) {
  const [newBody, setNewBody] = useState<'ZABS' | 'ZEMA'>('ZABS');
  const [newParam, setNewParam] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newUnit, setNewUnit] = useState("mg/L");
  const [isFetching, setIsFetching] = useState(false);

  const cacheInfo = getCacheInfo();
  const cacheStatus = cacheInfo ? `${cacheInfo.source} (${cacheInfo.ageInDays} days ago)` : 'No cache';

  const handleFetchStandards = async () => {
    setIsFetching(true);
    try {
      const zabsData = await fetchZABSStandards();
      const zemaData = await fetchZEMAStandards();
      const allData = [...zabsData, ...zemaData];
      setLimits(prev => [...prev, ...allData]);
      toast.success('Standards fetched and added successfully!');
    } catch (error) {
      toast.error('Failed to fetch standards from web');
    } finally {
      setIsFetching(false);
    }
  };

  const handleExport = () => {
    const dataStr = exportStandardsAsJSON(limits);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'water-standards.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    toast.success('Standards exported successfully!');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const imported = importStandardsFromJSON(e.target?.result as string);
            setLimits(prev => [...prev, ...imported]);
            toast.success('Standards imported successfully!');
          } catch (error) {
            toast.error('Failed to import standards');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const removeLimit = (id: string) => {
    setLimits(prev => prev.filter(l => l.id !== id));
    toast.success('Standard removed successfully!');
  };

  const addLimit = () => {
    if (!newParam || !newValue) {
      toast.error("Enter parameter and limit value");
      return;
    }
    const newLimit: RegulatoryLimit = {
      id: `rl${Date.now()}`,
      regulatoryBody: newBody,
      parameterName: newParam,
      limitValue: newValue,
      unit: newUnit
    };
    setLimits(prev => [...prev, newLimit]);
    setNewParam("");
    setNewValue("");
    toast.success("Standard added successfully!");
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-black text-[#003d7a] uppercase flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-[#e8b400]" /> Water Quality standards database
           </h2>
           <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">ZABS & ZEMA Regulatory Compliance Center • {cacheStatus}</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={handleFetchStandards} disabled={isFetching} className="text-xs border-blue-300 text-blue-600 hover:bg-blue-50">
              <RefreshCw className={`w-3 h-3 mr-1 ${isFetching ? 'animate-spin' : ''}`} /> {isFetching ? 'Fetching...' : 'Refresh from Web'}
           </Button>
           <Button variant="outline" size="sm" onClick={handleExport} className="text-xs border-gray-300">
              <Download className="w-3 h-3 mr-1" /> Export
           </Button>
           <Button variant="outline" size="sm" onClick={handleImport} className="text-xs border-gray-300">
              <Upload className="w-3 h-3 mr-1" /> Import
           </Button>
           <Button variant="outline" size="sm" onClick={onReset} className="text-xs border-gray-300">
              <RefreshCw className="w-3 h-3 mr-1" /> Reset All
           </Button>
        </div>
      </div>

      <div className="bg-[#f0f9ff] p-5 rounded-2xl border border-blue-100 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
         <div className="space-y-2">
            <label className="text-[10px] font-black text-[#003d7a] uppercase ml-1">Regulatory Body</label>
            <Select value={newBody} onValueChange={v => setNewBody(v as 'ZABS' | 'ZEMA')}>
               <SelectTrigger className="h-11 bg-white border-blue-200 shadow-none rounded-xl">
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  <SelectItem value="ZABS">ZABS</SelectItem>
                  <SelectItem value="ZEMA">ZEMA</SelectItem>
               </SelectContent>
            </Select>
         </div>
         <div className="md:col-span-1 space-y-2">
            <label className="text-[10px] font-black text-[#003d7a] uppercase ml-1">Parameter Name</label>
            <Input className="h-11 bg-white border-blue-200 rounded-xl" placeholder="pH, Nitrate, etc..." value={newParam} onChange={e => setNewParam(e.target.value)} />
         </div>
         <div className="space-y-2">
            <label className="text-[10px] font-black text-[#003d7a] uppercase ml-1">Regulatory Limit</label>
            <Input className="h-11 bg-white border-blue-200 rounded-xl" placeholder="6.5 - 8.5" value={newValue} onChange={e => setNewValue(e.target.value)} />
         </div>
         <div className="space-y-2">
            <label className="text-[10px] font-black text-[#003d7a] uppercase ml-1">Unit</label>
            <Input className="h-11 bg-white border-blue-200 rounded-xl" placeholder="mg/L" value={newUnit} onChange={e => setNewUnit(e.target.value)} />
         </div>
         <Button onClick={addLimit} className="h-11 bg-[#003d7a] hover:bg-[#002a5a] rounded-xl font-black uppercase text-xs tracking-widest">
            <Plus className="w-4 h-4 mr-2" /> Add standard 
         </Button>
      </div>

      <div className="overflow-x-auto border rounded-2xl shadow-sm bg-white">
         <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-500 font-black text-[10px] uppercase">
               <tr>
                  <th className="p-4 text-left">Regulatory Body</th>
                  <th className="p-4 text-left">Parameter Name</th>
                  <th className="p-4 text-center">Unit</th>
                  <th className="p-4 text-right">Standard Limit</th>
                  <th className="p-4 text-center w-20">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
               {limits.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                     <td className="p-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-black tracking-widest ${l.regulatoryBody === 'ZABS' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                           {l.regulatoryBody}
                        </span>
                     </td>
                     <td className="p-4 font-bold">{l.parameterName}</td>
                     <td className="p-4 text-center font-mono text-gray-400">{l.unit || "—"}</td>
                     <td className="p-4 text-right font-black text-[#003d7a]">{l.limitValue}</td>
                     <td className="p-4 text-center">
                        <button onClick={() => removeLimit(l.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                     </td>
                  </tr>
               ))}
               {limits.length === 0 && (
                 <tr>
                    <td colSpan={6} className="p-12 text-center text-gray-400 italic">No standards found. Add your first data point above.</td>
                 </tr>
               )}
            </tbody>
         </table>
      </div>
    </div>
  );
}
