import React, { useState, useRef, useEffect } from 'react';
import { Signature } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateSignatureId, normalizeImageFile } from '../utils/signatures';
import { Trash2, Edit3, Check, X } from 'lucide-react';

interface Props {
  signatures: Signature[];
  setSignatures: React.Dispatch<React.SetStateAction<Signature[]>>;
}

const DUMMY = { fullName: '', role: '', imageDataUrl: '' };

export function SignatureManager({ signatures, setSignatures }: Props) {
  const [form, setForm] = useState({ ...DUMMY });
  const [mode, setMode] = useState<'upload' | 'draw'>('upload');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 360;
    canvas.height = 130;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#003d7a';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }, [mode]);

  const validateDupes = (name: string, role: string, ignoreId?: string) => {
    return signatures.some(sig => sig.fullName.trim().toLowerCase() === name.trim().toLowerCase() && sig.role.trim().toLowerCase() === role.trim().toLowerCase() && sig.id !== ignoreId);
  };

  const resetForm = () => {
    setForm({ ...DUMMY });
    setError('');
    setSelectedId(null);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const onFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setError('Image too large (max 3MB).'); return; }
    try {
      const normalized = await normalizeImageFile(file);
      setForm(prev => ({ ...prev, imageDataUrl: normalized }));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleSave = async () => {
    if (!form.fullName.trim() || !form.role.trim()) { setError('Name and role are required.'); return; }
    if (!form.imageDataUrl) { setError('Signature image is required.'); return; }
    if (validateDupes(form.fullName, form.role, selectedId ?? undefined)) { setError('Duplicate signature (same name+role) is not allowed.'); return; }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      if (selectedId) {
        setSignatures(prev => prev.map(sig => sig.id === selectedId ? { ...sig, fullName: form.fullName.trim(), role: form.role.trim(), imageDataUrl: form.imageDataUrl, dateAdded: sig.dateAdded, lastUsedAt: sig.lastUsedAt } : sig));
      } else {
        const newSignature: Signature = {
          id: generateSignatureId(),
          fullName: form.fullName.trim(),
          role: form.role.trim(),
          imageDataUrl: form.imageDataUrl,
          dateAdded: now,
          isDefault: signatures.length === 0,
        };
        setSignatures(prev => [...prev, newSignature]);
      }
      resetForm();
      setError('');
    } finally {
      setIsSaving(false);
    }
  };

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    const x = 'touches' in event ? event.touches[0].clientX - rect.left : event.clientX - rect.left;
    const y = 'touches' in event ? event.touches[0].clientY - rect.top : event.clientY - rect.top;
    ctx.moveTo(x, y);
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const x = 'touches' in event ? event.touches[0].clientX - rect.left : event.clientX - rect.left;
    const y = 'touches' in event ? event.touches[0].clientY - rect.top : event.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setForm(prev => ({ ...prev, imageDataUrl: dataUrl }));
  };

  const onEdit = (id: string) => {
    const sig = signatures.find(item => item.id === id);
    if (!sig) return;
    setSelectedId(id);
    setForm({ fullName: sig.fullName, role: sig.role, imageDataUrl: sig.imageDataUrl });
    setMode('upload');
  };

  const onDelete = (id: string) => {
    const confirmed = window.confirm('Delete this signature?');
    if (!confirmed) return;
    setSignatures(prev => prev.filter(sig => sig.id !== id));
  };

  const setDefault = (id: string) => {
    setSignatures(prev => prev.map(sig => ({ ...sig, isDefault: sig.id === id })));
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[#003d7a]">Digital Signatures</h2>
        <span className="text-xs text-gray-500">{signatures.length} stored</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Input placeholder="Full Name" value={form.fullName} onChange={e => setForm(prev => ({ ...prev, fullName: e.target.value }))} />
        <Input placeholder="Role / Title" value={form.role} onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))} />
        <div className="flex items-center gap-2">
          <button className={`px-2 py-1 rounded ${mode === 'upload' ? 'bg-[#003d7a] text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setMode('upload')}>Upload</button>
          <button className={`px-2 py-1 rounded ${mode === 'draw' ? 'bg-[#003d7a] text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setMode('draw')}>Draw</button>
        </div>
        <div className="flex items-center justify-end space-x-2">
          <Button size="sm" onClick={resetForm} variant="outline"><X className="w-4 h-4" /> Reset</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            <Check className="w-4 h-4 mr-1" /> {selectedId ? 'Update' : 'Save'}
          </Button>
        </div>
      </div>

      {mode === 'upload' ? (
        <div className="flex items-center gap-2">
          <Input type="file" accept="image/png,image/jpeg" onChange={onFilePicked} />
          <span className="text-xs text-gray-500">PNG/JPG max 3MB</span>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <canvas ref={canvasRef}
            className="w-full h-[130px] touch-none"
            onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
            onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
          />
          <div className="p-2 flex justify-between">
            <Button size="xs" variant="outline" onClick={() => {
              const c = canvasRef.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return; ctx.clearRect(0, 0, c.width, c.height); setForm(prev => ({ ...prev, imageDataUrl: '' }));
            }}>Clear</Button>
            <Button size="xs" onClick={() => {
              const c = canvasRef.current; if (!c) return; const url = c.toDataURL('image/png'); setForm(prev => ({ ...prev, imageDataUrl: url }));
            }}>Save Drawing</Button>
          </div>
        </div>
      )}

      {form.imageDataUrl && (
        <div className="p-3 border rounded-lg my-3 flex items-center gap-3">
          <img src={form.imageDataUrl} alt="Preview" className="h-16 object-contain border rounded" />
          <span className="text-xs text-gray-500">Preview uploaded/drawn signature</span>
        </div>
      )}

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      <section className="mt-4">
        <h3 className="text-sm font-semibold text-[#003d7a] mb-2">Saved Signatures</h3>
        {signatures.length === 0 ? (
          <p className="text-sm text-gray-500">No signatures saved yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {signatures.map(sig => (
              <div key={sig.id} className="border rounded-lg p-2 flex items-start gap-2">
                <img src={sig.imageDataUrl} alt={sig.fullName} className="w-16 h-16 object-contain border rounded" />
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-sm">{sig.fullName}</p>
                    {sig.isDefault && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Default</span>}
                  </div>
                  <p className="text-xs text-gray-600">{sig.role}</p>
                  <p className="text-[10px] text-gray-500">Added {new Date(sig.dateAdded).toLocaleDateString()}</p>
                  <div className="mt-1 flex gap-1">
                    <Button size="xs" variant="outline" onClick={() => onEdit(sig.id)}><Edit3 className="w-3.5 h-3.5" /> Edit</Button>
                    <Button size="xs" variant="outline" onClick={() => setDefault(sig.id)}><Check className="w-3.5 h-3.5" /> Set default</Button>
                    <Button size="xs" variant="destructive" onClick={() => onDelete(sig.id)}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
