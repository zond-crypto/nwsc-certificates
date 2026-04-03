import React, { useState } from 'react';
import { RegulatoryLimit } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  limits: RegulatoryLimit[];
  setLimits: React.Dispatch<React.SetStateAction<RegulatoryLimit[]>>;
}

const REG_BODIES = ['ZABS', 'ZEMA'] as const;
type RegulatoryBody = (typeof REG_BODIES)[number];

export function WaterTypeManager({ limits, setLimits }: Props) {
  const [selectedBody, setSelectedBody] = useState<RegulatoryBody>('ZABS');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ parameterName: "", limitValue: "", unit: "" });

  const filteredLimits = limits.filter(l => l.regulatoryBody === selectedBody);

  const startEdit = (limit: RegulatoryLimit) => {
    setEditingId(limit.id);
    setEditValues({ parameterName: limit.parameterName, limitValue: limit.limitValue, unit: limit.unit });
  };

  const saveEdit = () => {
    if (!editValues.parameterName || !editValues.limitValue) {
      toast.error("Fill in all fields");
      return;
    }
    setLimits(prev => prev.map(l => 
      l.id === editingId 
        ? { ...l, parameterName: editValues.parameterName, limitValue: editValues.limitValue, unit: editValues.unit }
        : l
    ));
    setEditingId(null);
    toast.success("Parameter updated");
  };

  const deleteLimit = (id: string) => {
    if (confirm("Delete this parameter?")) {
      setLimits(prev => prev.filter(l => l.id !== id));
      toast.success("Parameter removed");
    }
  };

  const addNewParam = () => {
    const newParam: RegulatoryLimit = {
      id: `wl${Date.now()}`,
      regulatoryBody: selectedBody,
      parameterName: "New Parameter",
      limitValue: "",
      unit: "mg/L"
    };
    setLimits(prev => [...prev, newParam]);
    startEdit(newParam);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-[#003d7a] uppercase mb-4">Regulatory Standards Manager</h2>
        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-6">Select body and manage quality parameters</p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
          {REG_BODIES.map(body => (
            <button
              key={body}
              onClick={() => setSelectedBody(body)}
              className={`p-3 rounded-xl border-2 transition-all text-sm font-bold uppercase ${
                selectedBody === body
                  ? 'bg-[#003d7a] text-white border-[#003d7a]'
                  : 'bg-white text-[#003d7a] border-gray-200 hover:border-[#003d7a]'
              }`}
            >
              {body}
            </button>
          ))}
        </div>

        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-6 flex justify-between items-center">
          <div>
            <div className="text-sm font-black text-[#003d7a]">{selectedBody} Standards</div>
            <div className="text-xs text-gray-600 mt-1">Managed by: <span className="font-bold">{selectedBody}</span></div>
          </div>
          <Button onClick={addNewParam} className="bg-[#003d7a] hover:bg-[#002a5a] text-xs font-bold">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Parameter
          </Button>
        </div>
      </div>

      {filteredLimits.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500 text-sm">No parameters configured for {selectedBody}</p>
          <Button onClick={addNewParam} className="mt-4 bg-[#003d7a] hover:bg-[#002a5a]">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add First Parameter
          </Button>
        </div>
      ) : (
        <div className="border rounded-2xl overflow-hidden shadow-sm bg-white">
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="p-4 text-left text-[11px] font-black text-gray-600 uppercase">Parameter Name</th>
                <th className="p-4 text-center text-[11px] font-black text-gray-600 uppercase">Standard Limit</th>
                <th className="p-4 text-center text-[11px] font-black text-gray-600 uppercase">Unit</th>
                <th className="p-4 text-center text-[11px] font-black text-gray-600 uppercase">Regulatory Body</th>
                <th className="p-4 text-center text-[11px] font-black text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLimits.map(limit => (
                <tr key={limit.id} className="hover:bg-blue-50/50 transition-colors">
                  <td className="p-4">
                    {editingId === limit.id ? (
                      <Input
                        value={editValues.parameterName}
                        onChange={e => setEditValues(prev => ({ ...prev, parameterName: e.target.value }))}
                        className="text-sm font-bold"
                      />
                    ) : (
                      <span className="text-sm font-bold text-[#003d7a]">{limit.parameterName}</span>
                    )}
                  </td>
                  <td className="p-4">
                    {editingId === limit.id ? (
                      <Input
                        value={editValues.limitValue}
                        onChange={e => setEditValues(prev => ({ ...prev, limitValue: e.target.value }))}
                        placeholder="e.g., 6.5 - 8.5"
                        className="text-sm text-center font-bold"
                      />
                    ) : (
                      <span className="text-sm text-center font-bold text-[#003d7a]">{limit.limitValue}</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {editingId === limit.id ? (
                      <Input
                        value={editValues.unit}
                        onChange={e => setEditValues(prev => ({ ...prev, unit: e.target.value }))}
                        placeholder="mg/L"
                        className="text-sm text-center"
                      />
                    ) : (
                      <span className="text-sm text-gray-600">{limit.unit}</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <span className="text-xs font-bold bg-blue-100 text-[#003d7a] px-3 py-1 rounded-full inline-block">{limit.regulatoryBody}</span>
                  </td>
                  <td className="p-4 text-center flex justify-center gap-2">
                    {editingId === limit.id ? (
                      <>
                        <Button size="sm" onClick={saveEdit} className="bg-green-600 hover:bg-green-700 h-8 px-3">
                          <Save className="w-3.5 h-3.5 mr-1" /> Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          className="h-8 px-3"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEdit(limit)} className="h-8 px-3 border-blue-200">
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteLimit(limit.id)} className="h-8 px-3 text-red-600 hover:text-red-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
