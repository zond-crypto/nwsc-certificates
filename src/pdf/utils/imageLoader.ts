export function loadImg(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Do not set crossOrigin to anonymous as it can break local Vite server fetches
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width  = img.naturalWidth  || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext('2d');
        if (!ctx) { reject('No ctx'); return; }
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject('load error: ' + src);
    img.src = src;
  });
}
