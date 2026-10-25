export type FontType = 'variable' | 'multi' | 'single';

export interface ParsedFontMetadata {
  family?: string;
  format: 'woff2' | 'css';
  fontType: FontType;
  variableRange?: { min: number; max: number; default: number };
  availableWeights: number[];
  availableStyles: Array<'normal' | 'italic'>;
  style: 'normal' | 'italic' | 'all';
}

export const STANDARD_WEIGHTS: Array<{ value: number; label: string; name: string }> = [
  { value: 100, label: '100 Thin', name: 'Thin' },
  { value: 200, label: '200 ExtraLight', name: 'ExtraLight' },
  { value: 300, label: '300 Light', name: 'Light' },
  { value: 400, label: '400 Regular', name: 'Regular' },
  { value: 500, label: '500 Medium', name: 'Medium' },
  { value: 600, label: '600 SemiBold', name: 'SemiBold' },
  { value: 700, label: '700 Bold', name: 'Bold' },
  { value: 800, label: '800 ExtraBold', name: 'ExtraBold' },
  { value: 900, label: '900 Black', name: 'Black' },
];

export function getWeightLabel(w: number): string {
  const found = STANDARD_WEIGHTS.find((item) => item.value === w);
  return found ? found.label : `${w} Weight`;
}

/**
 * Parses Google Fonts URLs or direct font URLs to detect family name,
 * font type (variable, multi-weight, or single-weight), weight ranges,
 * discrete available weights, and supported styles (normal, italic).
 */
export function parseFontMetadataFromUrl(rawUrl: string): ParsedFontMetadata {
  const url = (rawUrl || '').trim();
  const isWoff2 = url.toLowerCase().includes('.woff2');
  const format: 'woff2' | 'css' = isWoff2 ? 'woff2' : 'css';

  let family: string | undefined;
  let fontType: FontType = 'single';
  let variableRange: { min: number; max: number; default: number } | undefined;
  const weightsSet = new Set<number>();
  const stylesSet = new Set<'normal' | 'italic'>();

  // Extract Google Fonts family parameter if present
  const familyMatch = url.match(/[?&]family=([^&]+)/);
  if (familyMatch) {
    const rawFamilyParam = decodeURIComponent(familyMatch[1]);
    const colonIdx = rawFamilyParam.indexOf(':');
    const familyNamePart = colonIdx !== -1 ? rawFamilyParam.substring(0, colonIdx) : rawFamilyParam;
    family = familyNamePart.replace(/\+/g, ' ').trim();

    if (colonIdx !== -1) {
      const spec = rawFamilyParam.substring(colonIdx + 1);
      const atIdx = spec.indexOf('@');

      if (atIdx !== -1) {
        const axes = spec.substring(0, atIdx).split(',');
        const tuples = spec.substring(atIdx + 1).split(';');

        const wghtIdx = axes.indexOf('wght');
        const italIdx = axes.indexOf('ital');

        if (italIdx !== -1) {
          for (const tuple of tuples) {
            const parts = tuple.split(',');
            const italVal = parts[italIdx];
            if (italVal === '1') stylesSet.add('italic');
            if (italVal === '0') stylesSet.add('normal');
            if (italVal && italVal.includes('..')) {
              stylesSet.add('normal');
              stylesSet.add('italic');
            }
          }
          if (axes.includes('ital') && stylesSet.size === 0) {
            stylesSet.add('normal');
            stylesSet.add('italic');
          }
        }

        const targetWghtIdx = wghtIdx !== -1 ? wghtIdx : axes.length === 1 ? 0 : -1;
        if (targetWghtIdx !== -1) {
          for (const tuple of tuples) {
            const parts = tuple.split(',');
            const wVal = parts[targetWghtIdx];
            if (!wVal) continue;

            if (wVal.includes('..')) {
              const [minStr, maxStr] = wVal.split('..');
              const min = parseFloat(minStr);
              const max = parseFloat(maxStr);
              if (!isNaN(min) && !isNaN(max)) {
                const rMin = Math.min(min, max);
                const rMax = Math.max(min, max);
                variableRange = {
                  min: rMin,
                  max: rMax,
                  default: rMin <= 400 && rMax >= 400 ? 400 : rMin,
                };
                fontType = 'variable';
              }
            } else {
              const w = parseFloat(wVal);
              if (!isNaN(w)) weightsSet.add(w);
            }
          }
        }
      } else {
        // Legacy v1 syntax: e.g. "400,700,400i,italic"
        const parts = spec.split(',');
        for (const part of parts) {
          if (part.includes('i') || part.includes('italic')) {
            stylesSet.add('italic');
          }
          const num = parseInt(part, 10);
          if (!isNaN(num)) {
            weightsSet.add(num);
          }
        }
      }
    }
  }

  // Check URL query parameters or path for `ital,wght` or other italic keywords
  if (
    url.includes('ital,wght') ||
    url.includes('ital@') ||
    url.includes(':italic') ||
    url.includes('font-style=italic')
  ) {
    stylesSet.add('italic');
    if (!stylesSet.has('normal')) stylesSet.add('normal');
  }

  // Fallback regex detection for wght@min..max (variable)
  if (!variableRange) {
    const rangeMatch = url.match(/wght@.*?(\d+)\.\.(\d+)/);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1], 10);
      const max = parseInt(rangeMatch[2], 10);
      const rMin = Math.min(min, max);
      const rMax = Math.max(min, max);
      variableRange = {
        min: rMin,
        max: rMax,
        default: rMin <= 400 && rMax >= 400 ? 400 : rMin,
      };
      fontType = 'variable';
    }
  }

  // Fallback regex detection for wght@400;700 (discrete weights)
  if (!variableRange && weightsSet.size === 0) {
    const weightsMatch = url.match(/wght@([0-9;]+)/);
    if (weightsMatch) {
      const nums = weightsMatch[1]
        .split(';')
        .map((n) => parseInt(n, 10))
        .filter((n) => !isNaN(n));
      for (const n of nums) weightsSet.add(n);
    }
  }

  // Default normal style if nothing specified
  if (stylesSet.size === 0) {
    stylesSet.add('normal');
  }

  let availableWeights = Array.from(weightsSet).sort((a, b) => a - b);
  if (fontType === 'variable' && variableRange) {
    // Variable font: discrete available weights can be standard weights within range
    const steps = [100, 200, 300, 400, 500, 600, 700, 800, 900].filter(
      (w) => w >= variableRange!.min && w <= variableRange!.max
    );
    availableWeights = steps.length > 0 ? steps : [variableRange.min, variableRange.max];
  } else {
    if (availableWeights.length > 1) {
      fontType = 'multi';
    } else if (availableWeights.length === 1) {
      fontType = 'single';
    } else {
      fontType = 'single';
      availableWeights = [400];
    }
  }

  const availableStyles: Array<'normal' | 'italic'> = [];
  if (stylesSet.has('normal')) availableStyles.push('normal');
  if (stylesSet.has('italic')) availableStyles.push('italic');

  const style: 'normal' | 'italic' | 'all' =
    availableStyles.length === 2
      ? 'all'
      : availableStyles[0] || 'normal';

  return {
    family,
    format,
    fontType,
    variableRange,
    availableWeights,
    availableStyles,
    style,
  };
}
