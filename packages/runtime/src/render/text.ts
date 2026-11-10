import type { Library, TextElement, TextSpan } from '../schema';
import { fillToCSS, fillToPaint, IdScope } from './fills';

/**
 * Resolves an i18n text string from an AnimDocument for a given locale and key.
 * Supports exact matching, case-insensitive / normalized (e.g. EN-US vs en-US vs en_US),
 * language code prefix fallback (e.g. en-US -> en), and defaultLocale fallback.
 */
export function resolveI18nText(
  doc: { i18n?: { defaultLocale?: string; locales?: Record<string, Record<string, string>> } } | undefined,
  locale: string | undefined,
  i18nKey: string | undefined
): string | undefined {
  if (!doc?.i18n?.locales || !i18nKey) return undefined;
  const locales = doc.i18n.locales;
  const targetLocale = (locale || doc.i18n.defaultLocale || 'en').trim();

  // 1. Direct match
  if (locales[targetLocale]?.[i18nKey] !== undefined) {
    return locales[targetLocale][i18nKey];
  }

  // 2. Normalized match (lowercase with hyphen: 'en-us', 'es-es', etc.)
  const normTarget = targetLocale.toLowerCase().replace(/_/g, '-');
  for (const [locKey, map] of Object.entries(locales)) {
    if (locKey.toLowerCase().replace(/_/g, '-') === normTarget && map?.[i18nKey] !== undefined) {
      return map[i18nKey];
    }
  }

  // 3. Base language prefix match (e.g. 'en-us' -> 'en')
  const baseLang = normTarget.split('-')[0];
  for (const [locKey, map] of Object.entries(locales)) {
    const normKey = locKey.toLowerCase().replace(/_/g, '-');
    if (normKey === baseLang && map?.[i18nKey] !== undefined) {
      return map[i18nKey];
    }
  }

  // 4. Fallback to defaultLocale
  const defaultLoc = doc.i18n.defaultLocale || 'en';
  if (locales[defaultLoc]?.[i18nKey] !== undefined) {
    return locales[defaultLoc][i18nKey];
  }
  const normDef = defaultLoc.toLowerCase().replace(/_/g, '-');
  for (const [locKey, map] of Object.entries(locales)) {
    if (locKey.toLowerCase().replace(/_/g, '-') === normDef && map?.[i18nKey] !== undefined) {
      return map[i18nKey];
    }
  }

  return undefined;
}

/** Binds a text field to a variable (Flash "Var:" field). */
export interface TextVariableBinding {
  get(name: string): unknown;
  set(name: string, value: string): void;
}

export interface TextRenderOptions {
  library?: Library;
  binding?: TextVariableBinding;
  localeText?: string;
  state?: Record<string, any>;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Resolves template tokens {variableName} inside a text string using reactive state and variable bindings.
 */
export function resolveInterpolatedText(
  rawText: string,
  state?: Record<string, any>,
  binding?: TextVariableBinding
): string {
  if (!rawText || typeof rawText !== 'string' || !rawText.includes('{')) return rawText ?? '';
  return rawText.replace(/\{([a-zA-Z0-9_$.]+)\}/g, (match, key) => {
    if (state && key in state && state[key] !== undefined) {
      return String(state[key]);
    }
    const val = binding?.get(key);
    if (val !== undefined && val !== null) {
      return String(val);
    }
    return match;
  });
}

const ALLOWED_TAGS = new Set(['B', 'I', 'U', 'BR', 'P', 'SPAN', 'FONT', 'A']);

/** Minimal sanitizer for the rich-text subset: strips disallowed tags/attributes. */
export function sanitizeHTML(doc: Document, html: string): DocumentFragment {
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        const el = child as Element;
        if (!ALLOWED_TAGS.has(el.tagName.toUpperCase())) {
          el.replaceWith(doc.createTextNode(el.textContent ?? ''));
          continue;
        }
        for (const a of Array.from(el.attributes)) {
          const ok = (a.name === 'href' && !/^\s*javascript:/i.test(a.value)) || a.name === 'color';
          if (!ok) el.removeAttribute(a.name);
        }
        walk(el);
      } else if (child.nodeType !== 3) {
        child.remove();
      }
    }
  };
  walk(tpl.content);
  return tpl.content;
}

function fontFamily(el: TextElement, library?: Library): string {
  const f = library?.fonts?.[el.fontId];
  return f ? `"${f.family}", sans-serif` : 'sans-serif';
}

export function renderSpanNodes(
  doc: Document,
  spans: TextSpan[],
  parentEl: TextElement,
  library?: Library
): HTMLSpanElement[] {
  return spans.map((sp) => {
    const span = doc.createElement('span');
    if (sp.id) span.dataset.spanId = sp.id;
    span.textContent = sp.text;

    if (sp.fontId) {
      const f = library?.fonts?.[sp.fontId];
      span.style.fontFamily = f ? `"${f.family}", sans-serif` : `"${sp.fontId}", sans-serif`;
    }
    if (sp.fontSize !== undefined) {
      span.style.fontSize = `${sp.fontSize}px`;
    }
    if (sp.fontWeight !== undefined) {
      span.style.fontWeight = String(sp.fontWeight);
    }
    if (sp.fontStyle !== undefined) {
      span.style.fontStyle = sp.fontStyle;
    }
    if (sp.textDecoration !== undefined) {
      span.style.textDecoration = sp.textDecoration;
    }
    if (sp.letterSpacing !== undefined) {
      span.style.letterSpacing = `${sp.letterSpacing}px`;
    }
    if (sp.opacity !== undefined) {
      span.style.opacity = String(sp.opacity);
    }
    if (sp.offsetY !== undefined && sp.offsetY !== 0) {
      span.style.display = 'inline-block';
      span.style.transform = `translateY(${sp.offsetY}px)`;
    }
    if (sp.fill && (sp.fill.type === 'linearGradient' || sp.fill.type === 'radialGradient')) {
      span.style.background = fillToCSS(sp.fill, library);
      span.style.webkitBackgroundClip = 'text';
      (span.style as any).backgroundClip = 'text';
      span.style.color = 'transparent';
      (span.style as any).webkitTextFillColor = 'transparent';
    } else if (sp.fill && sp.fill.type === 'solid') {
      span.style.color = sp.fill.color;
    } else if (sp.color !== undefined) {
      span.style.color = sp.color;
    }
    return span;
  });
}

export function setTextContent(
  node: HTMLElement,
  el: TextElement,
  value: string,
  library?: Library
): void {
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    if (node.value !== value) node.value = value;
  } else if (el.spans && el.spans.length > 0) {
    node.replaceChildren(...renderSpanNodes(node.ownerDocument, el.spans, el, library));
  } else if (el.html && el.mode !== 'input') {
    node.replaceChildren(sanitizeHTML(node.ownerDocument, value));
  } else {
    node.textContent = value;
  }
}

/** Renders static/dynamic as <div>, input as <input> (single-line) or <textarea> (multiline). */
export function renderText(doc: Document, el: TextElement, opts: TextRenderOptions = {}): HTMLElement {
  // If text is aligned along a vector path, render native SVG <textPath>
  if (el.pathConfig?.pathData) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as HTMLElement;
    svg.setAttribute('overflow', 'visible');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.width = `${el.width || 200}px`;
    svg.style.height = `${el.height || 60}px`;

    const pathId = `text_path_${el.id}`;
    const defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('id', pathId);
    path.setAttribute('d', el.pathConfig.pathData);
    defs.appendChild(path);
    svg.appendChild(defs);

    const textSvg = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
    textSvg.setAttribute('font-family', fontFamily(el, opts.library));
    textSvg.setAttribute('font-size', `${el.fontSize}px`);
    if (el.fontWeight) textSvg.setAttribute('font-weight', String(el.fontWeight));
    if (el.fontStyle) textSvg.setAttribute('font-style', el.fontStyle);
    if (el.letterSpacing) textSvg.setAttribute('letter-spacing', `${el.letterSpacing}px`);
    const textScope = new IdScope(`text_${el.id}`);
    textSvg.setAttribute(
      'fill',
      el.fill ? fillToPaint(el.fill, defs, textScope, opts.library) : (el.color || '#000000')
    );
    if (el.stroke && el.stroke.width > 0 && el.stroke.fill && el.stroke.fill.type !== 'none') {
      textSvg.setAttribute(
        'stroke',
        fillToPaint(el.stroke.fill, defs, textScope, opts.library)
      );
      textSvg.setAttribute('stroke-width', `${el.stroke.width}px`);
    }

    const textPath = doc.createElementNS('http://www.w3.org/2000/svg', 'textPath');
    textPath.setAttribute('href', `#${pathId}`);
    const offset = el.pathConfig.startOffset !== undefined ? `${el.pathConfig.startOffset}%` : '0%';
    textPath.setAttribute('startOffset', offset);
    textPath.textContent = opts.localeText !== undefined ? opts.localeText : el.text;
    textSvg.appendChild(textPath);
    svg.appendChild(textSvg);
    return svg;
  }

  let node: HTMLElement;
  if (el.mode === 'input') {
    node = el.multiline ? doc.createElement('textarea') : doc.createElement('input');
    if (node instanceof HTMLInputElement) node.type = 'text';
    node.style.border = 'none';
    node.style.background = 'transparent';
    node.style.outline = 'none';
    node.style.padding = '0';
    node.style.margin = '0';
    node.style.resize = 'none';
  } else {
    node = doc.createElement('div');
    node.style.whiteSpace = el.multiline ? 'pre-wrap' : 'pre';
    node.style.overflow = 'hidden';
    node.style.userSelect = el.selectable ? 'text' : 'none';
  }
  const s = node.style;
  s.position = 'absolute';
  s.left = '0';
  s.top = '0';
  s.boxSizing = 'border-box';
  s.width = el.textType === 'point' || !el.width ? 'auto' : `${el.width}px`;
  s.height = el.textType === 'point' || !el.height ? 'auto' : `${el.height}px`;
  if (el.textType === 'point') {
    s.overflow = 'visible';
    s.whiteSpace = el.multiline ? 'pre-wrap' : 'pre';
  }
  s.fontFamily = fontFamily(el, opts.library);
  s.fontSize = `${el.fontSize}px`;
  if (el.fill && (el.fill.type === 'linearGradient' || el.fill.type === 'radialGradient')) {
    s.background = fillToCSS(el.fill, opts.library);
    s.webkitBackgroundClip = 'text';
    (s as any).backgroundClip = 'text';
    s.color = 'transparent';
    (s as any).webkitTextFillColor = 'transparent';
  } else if (el.fill && el.fill.type === 'none') {
    s.color = 'transparent';
  } else if (el.fill && el.fill.type === 'solid') {
    s.color = el.fill.color;
  } else {
    s.color = el.color || '#000000';
  }
  if (el.stroke && el.stroke.width > 0 && el.stroke.fill && el.stroke.fill.type !== 'none') {
    if (el.stroke.fill.type === 'solid') {
      (s as any).webkitTextStroke = `${el.stroke.width}px ${el.stroke.fill.color}`;
    } else if (
      el.stroke.fill.type === 'linearGradient' ||
      el.stroke.fill.type === 'radialGradient'
    ) {
      const stopColor = el.stroke.fill.stops[0]?.color || '#000000';
      (s as any).webkitTextStroke = `${el.stroke.width}px ${stopColor}`;
    }
  }
  s.textAlign = el.align;
  s.lineHeight = el.lineHeight !== undefined ? String(el.lineHeight) : '1.2';
  if (el.fontWeight !== undefined) s.fontWeight = String(el.fontWeight);
  if (el.fontStyle !== undefined) s.fontStyle = el.fontStyle;
  if (el.textDecoration !== undefined) s.textDecoration = el.textDecoration;
  if (el.letterSpacing !== undefined) s.letterSpacing = `${el.letterSpacing}px`;

  const rawText = el.text || '';
  const initial =
    opts.localeText !== undefined
      ? opts.localeText
      : el.stateBinding && opts.state && opts.state[el.stateBinding] !== undefined
      ? String(opts.state[el.stateBinding])
      : el.variable && opts.state && opts.state[el.variable] !== undefined
      ? String(opts.state[el.variable])
      : el.variable && opts.binding && opts.binding.get(el.variable) !== undefined
      ? String(opts.binding.get(el.variable))
      : resolveInterpolatedText(rawText, opts.state, opts.binding);
  setTextContent(node, el, initial, opts.library);

  if (el.mode === 'input') {
    node.addEventListener('input', () => {
      const v = (node as HTMLInputElement).value;
      if (el.variable) opts.binding?.set(el.variable, v);
      opts.onChange?.(v);
    });
    if (opts.onFocus) node.addEventListener('focus', opts.onFocus);
    if (opts.onBlur) node.addEventListener('blur', opts.onBlur);
  }
  return node;
}
