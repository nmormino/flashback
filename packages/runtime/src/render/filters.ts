import type { Filter } from '../schema';

/** Converts Filter[] to a CSS `filter` string. Glow = stacked zero-offset drop-shadows. */
export function filtersToCSS(filters: readonly Filter[] | undefined): string {
  if (!filters || filters.length === 0) return '';
  const parts: string[] = [];
  for (const f of filters) {
    switch (f.type) {
      case 'blur':
        parts.push(`blur(${f.radius}px)`);
        break;
      case 'dropShadow':
        parts.push(`drop-shadow(${f.x}px ${f.y}px ${f.blur}px ${f.color})`);
        break;
      case 'glow': {
        const n = Math.max(1, Math.min(8, Math.round(f.strength)));
        for (let i = 0; i < n; i++) parts.push(`drop-shadow(0px 0px ${f.blur}px ${f.color})`);
        break;
      }
      case 'hueRotate':
        parts.push(`hue-rotate(${f.degrees}deg)`);
        break;
      default:
        parts.push(`${f.type}(${f.amount})`);
    }
  }
  return parts.join(' ');
}
