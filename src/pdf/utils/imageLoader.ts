/**
 * Loads an image from a URL, caps its longest edge to `maxPx`, and
 * re-encodes it as JPEG at `quality` (0–1). Returns a data URL.
 *
 * Keeping images small and JPEG-encoded is the single biggest lever
 * for reducing jsPDF output file size while maintaining visual quality.
 */
export function loadImg(
  src: string,
  maxPx = 256,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const nw = img.naturalWidth  || img.width  || 256;
        const nh = img.naturalHeight || img.height || 256;

        // Scale down so the longest side is at most maxPx
        const scale = Math.min(1, maxPx / Math.max(nw, nh));
        const cw = Math.round(nw * scale);
        const ch = Math.round(nh * scale);

        const c = document.createElement('canvas');
        c.width  = cw;
        c.height = ch;
        const ctx = c.getContext('2d');
        if (!ctx) { reject('No 2d ctx'); return; }

        // White background so transparent PNGs render cleanly as JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);

        resolve(c.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject('load error: ' + src);
    img.src = src;
  });
}

/**
 * Compresses an existing data URL (e.g. a user-uploaded signature) to JPEG.
 * Falls back to the original string if anything goes wrong.
 */
export function compressDataUrl(
  dataUrl: string,
  maxPx = 400,
  quality = 0.80
): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:')) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const nw = img.naturalWidth  || img.width  || maxPx;
        const nh = img.naturalHeight || img.height || maxPx;
        const scale = Math.min(1, maxPx / Math.max(nw, nh));
        const cw = Math.round(nw * scale);
        const ch = Math.round(nh * scale);

        const c = document.createElement('canvas');
        c.width  = cw;
        c.height = ch;
        const ctx = c.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);

        resolve(c.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl); // silent fallback
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

