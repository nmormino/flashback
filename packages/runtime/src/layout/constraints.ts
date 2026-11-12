import type { Transform, LayoutPin } from '../schema';

/**
 * Computes an element's effective rendered transform on-the-fly given its base transform,
 * the canonical artboard/stage dimensions, and the current/container preview dimensions.
 *
 * This enables non-destructive responsive layout (like Rive) where elements can anchor
 * to corners, center, or stretch without mutating raw keyframes or the canonical document.
 */
export function computeConstrainedTransform<T extends Partial<Transform>>(
  transform: T,
  baseWidth: number,
  baseHeight: number,
  currentWidth: number,
  currentHeight: number
): T {
  if (!transform) return transform;
  const pin = transform.pin;
  if (!pin || pin === 'none' || pin === 'top-left') {
    return { ...transform };
  }
  if (baseWidth <= 0 || baseHeight <= 0 || (baseWidth === currentWidth && baseHeight === currentHeight)) {
    return { ...transform };
  }

  const dx = currentWidth - baseWidth;
  const dy = currentHeight - baseHeight;
  const res: T = { ...transform };

  switch (pin) {
    case 'center':
      res.x = Math.round((transform.x ?? 0) + dx / 2);
      res.y = Math.round((transform.y ?? 0) + dy / 2);
      break;
    case 'top-right':
      res.x = Math.round((transform.x ?? 0) + dx);
      res.y = transform.y ?? 0;
      break;
    case 'bottom-left':
      res.x = transform.x ?? 0;
      res.y = Math.round((transform.y ?? 0) + dy);
      break;
    case 'bottom-right':
      res.x = Math.round((transform.x ?? 0) + dx);
      res.y = Math.round((transform.y ?? 0) + dy);
      break;
    case 'stretch': {
      const sx = currentWidth / baseWidth;
      const sy = currentHeight / baseHeight;
      res.scaleX = (transform.scaleX ?? 1) * sx;
      res.scaleY = (transform.scaleY ?? 1) * sy;
      res.x = Math.round((transform.x ?? 0) * sx);
      res.y = Math.round((transform.y ?? 0) * sy);
      break;
    }
  }

  return res;
}
