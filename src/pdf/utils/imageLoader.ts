export function loadImg(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = img.naturalWidth  || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext('2d');
      if (!ctx) { reject('No ctx'); return; }
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject('load error: ' + src);
  });
}
