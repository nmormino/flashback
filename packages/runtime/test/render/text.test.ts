// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import {
  sanitizeHTML,
  setTextContent,
  renderText,
  type TextVariableBinding,
} from '../../src/render/text';
import type { TextElement, Library } from '../../src/schema';

describe('text renderer', () => {
  describe('sanitizeHTML', () => {
    it('allows allowed tags and preserves valid attributes', () => {
      const html = '<p><b>Bold</b> <i>Italic</i> <font color="#ff0000">Red</font> <a href="https://example.com">Link</a></p>';
      const frag = sanitizeHTML(document, html);
      const div = document.createElement('div');
      div.appendChild(frag);

      expect(div.querySelector('b')?.textContent).toBe('Bold');
      expect(div.querySelector('i')?.textContent).toBe('Italic');
      const font = div.querySelector('font');
      expect(font?.getAttribute('color')).toBe('#ff0000');
      const a = div.querySelector('a');
      expect(a?.getAttribute('href')).toBe('https://example.com');
    });

    it('strips disallowed tags but preserves their inner text content', () => {
      const html = '<div>Safe text <script>alert("evil")</script><iframe src="malicious">Frame</iframe></div>';
      const frag = sanitizeHTML(document, html);
      const div = document.createElement('div');
      div.appendChild(frag);

      expect(div.querySelector('script')).toBeNull();
      expect(div.querySelector('iframe')).toBeNull();
      expect(div.textContent).toContain('Safe text');
      expect(div.textContent).toContain('alert("evil")');
    });

    it('strips javascript: links and event handlers', () => {
      const html = '<a href="javascript:doBad()" onclick="bad()">Click</a><span onmouseover="bad()" color="#00f">Text</span>';
      const frag = sanitizeHTML(document, html);
      const div = document.createElement('div');
      div.appendChild(frag);

      const a = div.querySelector('a')!;
      expect(a.hasAttribute('href')).toBe(false);
      expect(a.hasAttribute('onclick')).toBe(false);

      const span = div.querySelector('span')!;
      expect(span.hasAttribute('onmouseover')).toBe(false);
      expect(span.getAttribute('color')).toBe('#00f');
    });
  });

  describe('setTextContent', () => {
    it('sets .value for input and textarea elements', () => {
      const input = document.createElement('input');
      const textarea = document.createElement('textarea');
      const el: TextElement = {
        id: 't1',
        type: 'text',
        mode: 'input',
        text: 'hello',
        fontId: 'f1',
        fontSize: 14,
        color: '#000',
        align: 'left',
        width: 100,
        height: 20,
        multiline: false,
        selectable: true,
      };

      setTextContent(input, el, 'new input text');
      expect(input.value).toBe('new input text');

      setTextContent(textarea, { ...el, multiline: true }, 'new textarea text');
      expect(textarea.value).toBe('new textarea text');
    });

    it('sets sanitized HTML for html: true text nodes', () => {
      const div = document.createElement('div');
      const el: TextElement = {
        id: 't2',
        type: 'text',
        mode: 'dynamic',
        text: 'initial',
        html: true,
        fontId: 'f1',
        fontSize: 16,
        color: '#333',
        align: 'left',
        width: 200,
        height: 50,
        multiline: true,
        selectable: true,
      };

      setTextContent(div, el, '<b>Hello</b> <i>World</i><script>bad()</script>');
      expect(div.querySelector('b')?.textContent).toBe('Hello');
      expect(div.querySelector('i')?.textContent).toBe('World');
      expect(div.querySelector('script')).toBeNull();
    });

    it('sets plain textContent for standard text elements', () => {
      const div = document.createElement('div');
      const el: TextElement = {
        id: 't3',
        type: 'text',
        mode: 'static',
        text: '',
        html: false,
        fontId: 'f1',
        fontSize: 12,
        color: '#000',
        align: 'left',
        width: 100,
        height: 30,
        multiline: false,
        selectable: false,
      };

      setTextContent(div, el, '<b>Not rendered as bold</b>');
      expect(div.querySelector('b')).toBeNull();
      expect(div.textContent).toBe('<b>Not rendered as bold</b>');
    });
  });

  describe('renderText', () => {
    it('renders static and dynamic text into div elements with typography styles', () => {
      const lib: Library = {
        symbols: {},
        bitmaps: {},
        sounds: {},
        fonts: {
          customFont: {
            id: 'customFont',
            name: 'Custom',
            family: 'MyCustomFont',
            style: 'normal',
            weight: 400,
          },
        },
      };

      const el: TextElement = {
        id: 't_static',
        type: 'text',
        mode: 'static',
        text: 'Static Label',
        fontId: 'customFont',
        fontSize: 24,
        color: '#336699',
        align: 'center',
        width: 180,
        height: 40,
        multiline: false,
        selectable: false,
      };

      const node = renderText(document, el, { library: lib });
      expect(node.tagName.toLowerCase()).toBe('div');
      expect(node.textContent).toBe('Static Label');
      expect(node.style.position).toBe('absolute');
      expect(node.style.width).toBe('180px');
      expect(node.style.height).toBe('40px');
      expect(node.style.fontSize).toBe('24px');
      expect(node.style.color).toBe('#336699');
      expect(node.style.textAlign).toBe('center');
      expect(node.style.fontFamily).toContain('MyCustomFont');
      expect(node.style.fontFamily).toContain('sans-serif');
      expect(node.style.whiteSpace).toBe('pre');
      expect(node.style.userSelect).toBe('none');
    });

    it('renders text with bold, italic, and underline formatting', () => {
      const el: TextElement = {
        id: 't_fmt',
        type: 'text',
        mode: 'static',
        text: 'Formatted Text',
        fontId: 'default',
        fontSize: 18,
        fontWeight: 'bold',
        fontStyle: 'italic',
        textDecoration: 'underline',
        color: '#ffffff',
        align: 'left',
        width: 200,
        height: 30,
        multiline: false,
        selectable: false,
      };

      const node = renderText(document, el);
      expect(node.style.fontWeight).toBe('bold');
      expect(node.style.fontStyle).toBe('italic');
      expect(node.style.textDecoration).toBe('underline');
    });

    it('renders numeric variable font weight (e.g. 543)', () => {
      const el: TextElement = {
        id: 't_var',
        type: 'text',
        mode: 'static',
        text: 'Variable Weight',
        fontId: 'default',
        fontSize: 18,
        fontWeight: 543,
        fontStyle: 'normal',
        color: '#ffffff',
        align: 'left',
        width: 200,
        height: 30,
        multiline: false,
        selectable: false,
      };

      const node = renderText(document, el);
      expect(node.style.fontWeight).toBe('543');
      expect(node.style.fontStyle).toBe('normal');
    });

    it('renders dynamic text with selectable text and pre-wrap multiline', () => {
      const el: TextElement = {
        id: 't_dyn',
        type: 'text',
        mode: 'dynamic',
        text: 'Line 1\nLine 2',
        fontId: 'unknown',
        fontSize: 14,
        color: '#000000',
        align: 'right',
        width: 250,
        height: 100,
        multiline: true,
        selectable: true,
      };

      const node = renderText(document, el);
      expect(node.style.whiteSpace).toBe('pre-wrap');
      expect(node.style.userSelect).toBe('text');
      expect(node.style.fontFamily).toBe('sans-serif');
    });

    it('renders single-line input text as input element', () => {
      const el: TextElement = {
        id: 't_in',
        type: 'text',
        mode: 'input',
        text: 'Default input',
        fontId: 'default',
        fontSize: 14,
        color: '#111',
        align: 'left',
        width: 120,
        height: 25,
        multiline: false,
        selectable: true,
      };

      const node = renderText(document, el) as HTMLInputElement;
      expect(node.tagName.toLowerCase()).toBe('input');
      expect(node.type).toBe('text');
      expect(node.value).toBe('Default input');
      expect(node.style.outline).toMatch(/^none/);
      expect(node.style.background).toBe('transparent');
    });

    it('renders multiline input text as textarea element', () => {
      const el: TextElement = {
        id: 't_area',
        type: 'text',
        mode: 'input',
        text: 'Line A\nLine B',
        fontId: 'default',
        fontSize: 14,
        color: '#111',
        align: 'left',
        width: 200,
        height: 80,
        multiline: true,
        selectable: true,
      };

      const node = renderText(document, el) as HTMLTextAreaElement;
      expect(node.tagName.toLowerCase()).toBe('textarea');
      expect(node.value).toBe('Line A\nLine B');
      expect(node.style.resize).toBe('none');
    });

    it('integrates with TextVariableBinding and triggers event handlers', () => {
      const store: Record<string, unknown> = {
        score: '1000',
      };

      const binding: TextVariableBinding = {
        get: (name) => store[name],
        set: (name, val) => {
          store[name] = val;
        },
      };

      const onChange = vi.fn();
      const onFocus = vi.fn();
      const onBlur = vi.fn();

      const el: TextElement = {
        id: 't_var',
        type: 'text',
        mode: 'input',
        text: 'Initial',
        variable: 'score',
        fontId: 'default',
        fontSize: 18,
        color: '#000',
        align: 'left',
        width: 100,
        height: 30,
        multiline: false,
        selectable: true,
      };

      const input = renderText(document, el, {
        binding,
        onChange,
        onFocus,
        onBlur,
      }) as HTMLInputElement;

      // Initial value taken from binding.get('score')
      expect(input.value).toBe('1000');

      // Focus
      input.dispatchEvent(new Event('focus'));
      expect(onFocus).toHaveBeenCalledTimes(1);

      // Typing input
      input.value = '2500';
      input.dispatchEvent(new Event('input'));
      expect(store['score']).toBe('2500');
      expect(onChange).toHaveBeenCalledWith('2500');

      // Blur
      input.dispatchEvent(new Event('blur'));
      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it('renders rich text spans with individual styles, color, weight, and animation offsets', () => {
      const el: TextElement = {
        id: 't_spans',
        type: 'text',
        mode: 'static',
        text: 'Hello World',
        fontId: 'default',
        fontSize: 16,
        color: '#ffffff',
        align: 'left',
        width: 200,
        height: 40,
        multiline: false,
        selectable: false,
        spans: [
          {
            id: 's0',
            text: 'Hello ',
            fontSize: 20,
            color: '#ff0000',
            fontWeight: 700,
            fontStyle: 'italic',
            textDecoration: 'underline',
            letterSpacing: 2,
            offsetY: -5,
            opacity: 0.8,
          },
          {
            id: 's1',
            text: 'World',
            fontSize: 24,
            color: '#00ff00',
            fontWeight: 300,
          },
        ],
      };

      const div = renderText(document, el);
      const spanNodes = div.querySelectorAll('span');
      expect(spanNodes.length).toBe(2);

      const s0 = spanNodes[0];
      expect(s0.textContent).toBe('Hello ');
      expect(s0.style.fontSize).toBe('20px');
      expect(['#ff0000', 'rgb(255, 0, 0)']).toContain(s0.style.color);
      expect(s0.style.fontWeight).toBe('700');
      expect(s0.style.fontStyle).toBe('italic');
      expect(s0.style.textDecoration).toBe('underline');
      expect(s0.style.letterSpacing).toBe('2px');
      expect(s0.style.transform).toBe('translateY(-5px)');
      expect(s0.style.opacity).toBe('0.8');

      const s1 = spanNodes[1];
      expect(s1.textContent).toBe('World');
      expect(s1.style.fontSize).toBe('24px');
      expect(['#00ff00', 'rgb(0, 255, 0)']).toContain(s1.style.color);
      expect(s1.style.fontWeight).toBe('300');
    });
  });
});
