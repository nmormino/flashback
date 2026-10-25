import type { Library, TextElement, TextSpan } from '../schema';
import { fillToCSS } from './fills';

/** Binds a text field to a variable (Flash "Var:" field). */
export interface TextVariableBinding {
  get(name: string): unknown;
  set(name: string, value: string): void;
}

export interface TextRenderOptions {
  library?: Library;
  binding?: TextVariableBinding;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
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
    textSvg.setAttribute('fill', el.fill?.type === 'solid' ? el.fill.color : el.color || '#ffffff');

    const textPath = doc.createElementNS('http://www.w3.org/2000/svg', 'textPath');
    textPath.setAttribute('href', `#${pathId}`);
    const offset = el.pathConfig.startOffset !== undefined ? `${el.pathConfig.startOffset}%` : '0%';
    textPath.setAttribute('startOffset', offset);
    textPath.textContent = el.text;
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
  s.width = `${el.width}px`;
  s.height = `${el.height}px`;
  s.fontFamily = fontFamily(el, opts.library);
  s.fontSize = `${el.fontSize}px`;
  if (el.fill && (el.fill.type === 'linearGradient' || el.fill.type === 'radialGradient')) {
    s.background = fillToCSS(el.fill, opts.library);
    s.webkitBackgroundClip = 'text';
    (s as any).backgroundClip = 'text';
    s.color = 'transparent';
    (s as any).webkitTextFillColor = 'transparent';
  } else if (el.fill && el.fill.type === 'solid') {
    s.color = el.fill.color;
  } else {
    s.color = el.color;
  }
  s.textAlign = el.align;
  s.lineHeight = el.lineHeight !== undefined ? String(el.lineHeight) : '1.2';
  if (el.fontWeight !== undefined) s.fontWeight = String(el.fontWeight);
  if (el.fontStyle !== undefined) s.fontStyle = el.fontStyle;
  if (el.textDecoration !== undefined) s.textDecoration = el.textDecoration;
  if (el.letterSpacing !== undefined) s.letterSpacing = `${el.letterSpacing}px`;

  const initial =
    el.variable && opts.binding && opts.binding.get(el.variable) !== undefined
      ? String(opts.binding.get(el.variable))
      : el.text;
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
