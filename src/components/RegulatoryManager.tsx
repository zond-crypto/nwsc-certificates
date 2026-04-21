import React, { useState } from 'react';
import { RegulatoryLimit } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ShieldCheck, RefreshCw, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  cacheStandards,
  clearStandardsCache,
  exportStandardsAsJSON,
  importStandardsFromJSON,
  mergeRegulatoryLimits,
} from '../utils/standardsFetcher';

interface Props {
  limits: RegulatoryLimit[];
  setLimits: React.Dispatch<React.SetStateAction<RegulatoryLimit[]>>;
  onReset: () => void;
}

export function RegulatoryManager({ limits, setLimits, onReset }: Props) {
  const [newBody, setNewBody] = useState<'ZABS' | 'ZEMA'>('ZABS');
  const [newParam, setNewParam] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newUnit, setNewUnit] = useState('mg/L');

  const handleExport = () => {
    const dataStr = exportStandardsAsJSON(limits);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
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
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = importStandardsFromJSON(event.target?.result as string);
          const merged = mergeRegulatoryLimits(limits, imported);

          if (merged.addedCount === 0) {
            toast.info('All imported standards were already present.');
            return;
          }

          setLimits(merged.limits);
          cacheStandards(merged.limits, 'imported');
          toast.success(`Imported ${merged.addedCount} standard${merged.addedCount === 1 ? '' : 's'}.`);
        } catch (error) {
          toast.error('Failed to import standards');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const removeLimit = (id: string) => {
    const nextLimits = limits.filter(limit => limit.id !== id);
    setLimits(nextLimits);
    cacheStandards(nextLimits, 'manual');
    toast.success('Standard removed successfully!');
  };

  const addLimit = () => {
    if (!newParam || !newValue) {
      toast.error('Enter parameter and limit value');
      return;
    }

    const newLimit: RegulatoryLimit = {
      id: `rl${Date.now()}`,
      regulatoryBody: newBody,
      parameterName: newParam,
      limitValue: newValue,
      unit: newUnit,
    };

    const merged = mergeRegulatoryLimits(limits, [newLimit]);
    if (merged.addedCount === 0) {
      toast.info('That standard already exists.');
      return;
    }

    setLimits(merged.limits);
    cacheStandards(merged.limits, 'manual');
    setNewParam('');
    setNewValue('');
    toast.success('Standard added successfully!');
  };

  return (
    <div className="space-y-6 rounded-xl border bg-white p-6 shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black uppercase text-[#003d7a]">
            <ShieldCheck className="h-7 w-7 text-[#e8b400]" /> Water Quality Standards Library
          </h2>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-gray-400">
            Manual and JSON import workflow for ZABS and ZEMA references • {limits.length} active standards
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="text-xs border-gray-300">
            <Download className="mr-1 h-3 w-3" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleImport} className="text-xs border-gray-300">
            <Upload className="mr-1 h-3 w-3" /> Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearStandardsCache();
              toast.success('Standards import cache cleared.');
            }}
            className="text-xs border-gray-300"
          >
            <RefreshCw className="mr-1 h-3 w-3" /> Clear Cache
          </Button>
          <Button variant="outline" size="sm" onClick={onReset} className="text-xs border-gray-300">
            <RefreshCw className="mr-1 h-3 w-3" /> Reset All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-end gap-4 rounded-2xl border border-blue-100 bg-[#f0f9ff] p-5 md:grid-cols-5">
        <div className="space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase text-[#003d7a]">Regulatory Body</label>
          <Select value={newBody} onValueChange={v => setNewBody(v as 'ZABS' | 'ZEMA')}>
            <SelectTrigger className="h-11 rounded-xl border-blue-200 bg-white shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ZABS">ZABS</SelectItem>
              <SelectItem value="ZEMA">ZEMA</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-1">
          <label className="ml-1 text-[10px] font-black uppercase text-[#003d7a]">Parameter Name</label>
          <Input className="h-11 rounded-xl border-blue-200 bg-white" placeholder="pH, Nitrate, etc..." value={newParam} onChange={e => setNewParam(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase text-[#003d7a]">Regulatory Limit</label>
          <Input className="h-11 rounded-xl border-blue-200 bg-white" placeholder="6.5 - 8.5" value={newValue} onChange={e => setNewValue(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase text-[#003d7a]">Unit</label>
          <Input className="h-11 rounded-xl border-blue-200 bg-white" placeholder="mg/L" value={newUnit} onChange={e => setNewUnit(e.target.value)} />
        </div>
        <Button onClick={addLimit} className="h-11 rounded-xl bg-[#003d7a] text-xs font-black uppercase tracking-widest hover:bg-[#002a5a]">
          <Plus className="mr-2 h-4 w-4" /> Add Standard
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-[10px] font-black uppercase text-gray-500">
            <tr>
              <th className="p-4 text-left">Regulatory Body</th>
              <th className="p-4 text-left">Parameter Name</th>
              <th className="p-4 text-center">Unit</th>
              <th className="p-4 text-right">Standard Limit</th>
              <th className="w-20 p-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {limits.map(limit => (
              <tr key={limit.id} className="transition-colors hover:bg-gray-50">
                <td className="p-4">
                  <span className={`rounded px-2 py-1 text-[10px] font-black tracking-widest ${limit.regulatoryBody === 'ZABS' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {limit.regulatoryBody}
                  </span>
                </td>
                <td className="p-4 font-bold">{limit.parameterName}</td>
                <td className="p-4 text-center font-mono text-gray-400">{limit.unit || '-'}</td>
                <td className="p-4 text-right font-black text-[#003d7a]">{limit.limitValue}</td>
                <td className="p-4 text-center">
                  <button onClick={() => removeLimit(limit.id)} className="text-gray-300 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {limits.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center italic text-gray-400">
                  No standards found. Add your first data point above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
