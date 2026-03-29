import React, { useState } from 'react';
import { ServicePrice } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  priceList: ServicePrice[];
  setPriceList: React.Dispatch<React.SetStateAction<ServicePrice[]>>;
  onResetToDefault: () => void;
}

export function PriceListManager({ priceList, setPriceList, onResetToDefault }: Props) {
  const [newServiceName, setNewServiceName] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const addService = () => {
    if (!newServiceName || !newPrice) {
      toast.error("Enter both service name and price");
      return;
    }
    const newEntry: ServicePrice = {
      id: `sp${Date.now()}`,
      parameterName: newServiceName,
      unitPrice: parseFloat(newPrice) || 0
    };
    setPriceList(prev => [...prev, newEntry]);
    setNewServiceName("");
    setNewPrice("");
    toast.success("Service added to price list");
  };

  const updatePrice = (id: string, price: number) => {
    setPriceList(prev => prev.map(p => p.id === id ? { ...p, unitPrice: price } : p));
  };

  const removeService = (id: string) => {
    setPriceList(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-black text-[#003d7a] uppercase">Parameter Price Database</h2>
           <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1 italic">Core Pricing Management for Services</p>
        </div>
        <Button variant="outline" size="sm" onClick={onResetToDefault} className="text-xs border-gray-300">
           <RefreshCw className="w-3 h-3 mr-1" /> Reset to Defaults
        </Button>
      </div>

      <div className="bg-[#f0f9ff] p-5 rounded-2xl border border-blue-100 flex flex-col md:flex-row gap-4 items-end">
         <div className="flex-1 space-y-2">
            <label className="text-[10px] font-black text-[#003d7a] uppercase ml-1">Service/Parameter Name</label>
            <Input className="h-11 bg-white border-blue-200 rounded-xl" placeholder="e.g. Lead (Pb) Analysis..." value={newServiceName} onChange={e => setNewServiceName(e.target.value)} />
         </div>
         <div className="w-full md:w-32 space-y-2">
            <label className="text-[10px] font-black text-[#003d7a] uppercase ml-1">Unit Price (K)</label>
            <Input type="number" className="h-11 bg-white border-blue-200 rounded-xl" placeholder="0.00" value={newPrice} onChange={e => setNewPrice(e.target.value)} />
         </div>
         <Button onClick={addService} className="h-11 bg-[#003d7a] hover:bg-[#002a5a] rounded-xl px-8 font-black uppercase text-xs tracking-widest">
            <Plus className="w-4 h-4 mr-2" /> Add 
         </Button>
      </div>

      <div className="border rounded-2xl overflow-hidden shadow-sm">
         <table className="w-full text-sm">
            <thead>
               <tr className="bg-gray-100 text-gray-500 font-black text-[10px] uppercase">
                  <th className="p-4 text-left">Service Name</th>
                  <th className="p-4 text-right w-40">Standard Rate (K)</th>
                  <th className="p-4 text-center w-20">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
               {priceList.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                     <td className="p-4 font-bold text-[#003d7a]">{item.parameterName}</td>
                     <td className="p-4">
                        <Input 
                           type="number" 
                           className="h-8 text-right font-black text-[#003d7a] border-transparent hover:border-gray-200 transition-all focus:bg-white" 
                           value={item.unitPrice} 
                           onChange={e => updatePrice(item.id, parseFloat(e.target.value) || 0)} 
                        />
                     </td>
                     <td className="p-4 text-center">
                        <button onClick={() => removeService(item.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                     </td>
                  </tr>
               ))}
               {priceList.length === 0 && (
                 <tr>
                    <td colSpan={3} className="p-12 text-center text-gray-400 italic">No services defined in database yet.</td>
                 </tr>
               )}
            </tbody>
         </table>
      </div>
    </div>
  );
}
