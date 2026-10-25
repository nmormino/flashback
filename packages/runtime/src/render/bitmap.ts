import type { BitmapElement, Library } from '../schema';

export function renderBitmap(doc: Document, el: BitmapElement, library?: Library): HTMLImageElement {
  const img = doc.createElement('img');
  const asset = library?.bitmaps?.[el.bitmapId];
  img.draggable = false;
  img.alt = '';
  img.style.position = 'absolute';
  img.style.left = '0';
  img.style.top = '0';
  img.style.display = 'block';
  if (asset) {
    img.src = asset.src;
    img.width = asset.width;
    img.height = asset.height;
    if (!asset.smoothing) img.style.imageRendering = 'pixelated';
  }
  return img;
}
