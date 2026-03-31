import { Signature } from '../types';

const STORAGE_KEY = 'nkana_signatures';

export function loadSignatures(): Signature[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveSignatures(signatures: Signature[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(signatures));
}

export function generateSignatureId() {
  return `sig-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export async function normalizeImageFile(file: File, maxWidth = 600, maxHeight = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.match(/^image\/png|image\/jpeg|image\/jpg$/i)) {
      reject(new Error('Invalid image format'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Failed to load image')); 
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
