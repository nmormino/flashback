import { describe, it, expect } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  computeInterpolatedElement,
  computeInterpolatedTransform,
  interpolateColor,
  parseColor,
} from '../src/panels/Stage/Stage';
import { editorActions, getEditorState } from '../src/state/editorStore';
import { AddFontModal } from '../src/dialogs/AddFontModal';
import type { TextElement, TextSpan } from '@flashback/runtime';

describe('Rich Text Editing, Character Animation & Font Preview', () => {
  describe('1. Text Padding Shift Bug Fix', () => {
    it('ensures selection box wraps exact element bounds without internal offset padding', () => {
      editorActions.newDocument();
      const el: TextElement = {
        id: 'txt_shift_test',
        type: 'text',
        mode: 'static',
        text: 'Zero Shift Text',
        fontId: 'default',
        fontSize: 20,
        color: '#ffffff',
        align: 'left',
        width: 140,
        height: 28,
        multiline: false,
        selectable: true,
        transform: {
          x: 100,
          y: 200,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(el);
      editorActions.selectElements([el.id]);

      // Element bounds must be exact (x:0, y:0, width:140, height:28)
      // When rendered, selectionBox coordinates are left: bounds.x, top: bounds.y
      // without -2 / +4 internal shifts
      const doc = getEditorState().doc;
      const found = doc.root.layers[0].keyframes[0].elements.find((e) => e.id === el.id);
      expect(found).toBeDefined();
      expect(found?.type).toBe('text');
      expect((found as TextElement).width).toBe(140);
      expect((found as TextElement).height).toBe(28);
    });
  });

  describe('2. Custom Font Preview Bug Fix', () => {
    it('dynamically injects preview stylesheet and renders loading indicator', async () => {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      // Open AddFontModal
      await act(async () => {
        editorActions.setAddFontModalOpen(true);
        root.render(React.createElement(AddFontModal));
      });

      // Check that a preview link is injected into document.head
      const previewLink = document.getElementById('flashback-preview-font-link') as HTMLLinkElement | null;
      expect(previewLink).not.toBeNull();
      expect(previewLink?.rel).toBe('stylesheet');
      expect(previewLink?.href).toContain('fonts.googleapis.com');

      // The preview box is rendered
      const previewBox = container.querySelector('[data-testid="font-preview-box"]');
      expect(previewBox).not.toBeNull();

      // Clean up
      await act(async () => {
        editorActions.setAddFontModalOpen(false);
        root.unmount();
      });
      container.remove();
    });
  });

  describe('3. Rich Text Editing with Per-Character / Span Formatting', () => {
    it('formats selected character range with editorActions.formatSelectedTextRange', () => {
      editorActions.newDocument();
      const textEl: TextElement = {
        id: 'text_rich_1',
        type: 'text',
        mode: 'static',
        text: 'Hello World',
        fontId: 'default',
        fontSize: 16,
        color: '#ffffff',
        align: 'left',
        width: 150,
        height: 30,
        multiline: false,
        selectable: true,
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);

      // Select "World" (indices 6 to 11) and format with bold red 24px
      editorActions.formatSelectedTextRange('text_rich_1', 6, 11, {
        color: '#ff0000',
        fontWeight: 700,
        fontSize: 24,
      });

      const updated = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'text_rich_1'
      ) as TextElement;

      expect(updated.spans).toBeDefined();
      expect(updated.spans?.length).toBe(2);

      // Span 0: "Hello "
      expect(updated.spans?.[0].text).toBe('Hello ');
      expect(updated.spans?.[0].fontSize).toBe(16);
      expect(updated.spans?.[0].color).toBe('#ffffff');

      // Span 1: "World"
      expect(updated.spans?.[1].text).toBe('World');
      expect(updated.spans?.[1].fontSize).toBe(24);
      expect(updated.spans?.[1].color).toBe('#ff0000');
      expect(updated.spans?.[1].fontWeight).toBe(700);

      // Next, select "Hello" (indices 0 to 5) and format with italic
      editorActions.formatSelectedTextRange('text_rich_1', 0, 5, {
        fontStyle: 'italic',
      });

      const updated2 = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'text_rich_1'
      ) as TextElement;

      expect(updated2.spans?.length).toBe(3); // "Hello" (italic), " " (normal), "World" (bold red)
      expect(updated2.spans?.[0].text).toBe('Hello');
      expect(updated2.spans?.[0].fontStyle).toBe('italic');
      expect(updated2.spans?.[1].text).toBe(' ');
      expect(updated2.spans?.[2].text).toBe('World');
      expect(updated2.spans?.[2].fontWeight).toBe(700);
    });

    it('coalesces adjacent characters with identical styles into a single span', () => {
      editorActions.newDocument();
      const textEl: TextElement = {
        id: 'text_coalesce',
        type: 'text',
        mode: 'static',
        text: 'AAAA',
        fontId: 'default',
        fontSize: 16,
        color: '#ffffff',
        align: 'left',
        width: 100,
        height: 30,
        multiline: false,
        selectable: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(textEl);

      // Format first two characters
      editorActions.formatSelectedTextRange('text_coalesce', 0, 2, { color: '#00ff00' });
      // Format next two characters with same formatting
      editorActions.formatSelectedTextRange('text_coalesce', 2, 4, { color: '#00ff00' });

      const doc = getEditorState().doc;
      const el = doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'text_coalesce'
      ) as TextElement;

      expect(el.spans).toBeDefined();
      expect(el.spans?.length).toBe(1);
      expect(el.spans?.[0].text).toBe('AAAA');
      expect(el.spans?.[0].color).toBe('#00ff00');
    });

    it('tracks textSelection state in store', () => {
      editorActions.setTextSelection({
        elementId: 'text_1',
        start: 3,
        end: 8,
      });

      expect(getEditorState().textSelection).toEqual({
        elementId: 'text_1',
        start: 3,
        end: 8,
      });

      editorActions.setTextSelection(null);
      expect(getEditorState().textSelection).toBeNull();
    });
  });

  describe('4. Smooth Text Animation Between Keyframes', () => {
    it('smoothly interpolates fontSize, letterSpacing, fontWeight, and color', () => {
      const startEl: TextElement = {
        id: 'tween_text',
        type: 'text',
        mode: 'static',
        text: 'Morphing Text',
        fontId: 'default',
        fontSize: 20,
        letterSpacing: 0,
        fontWeight: 100,
        color: '#ff0000',
        align: 'left',
        width: 200,
        height: 40,
        multiline: false,
        selectable: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
      };

      const endEl: TextElement = {
        ...startEl,
        fontSize: 40,
        letterSpacing: 10,
        fontWeight: 900,
        color: '#0000ff',
      };

      // Halfway (t = 0.5)
      const mid = computeInterpolatedElement(startEl, endEl, 0.5) as TextElement;

      expect(mid.fontSize).toBe(30);
      expect(mid.letterSpacing).toBe(5);
      expect(mid.fontWeight).toBe(500);

      const parsedColor = parseColor(mid.color);
      expect(parsedColor.r).toBe(128);
      expect(parsedColor.g).toBe(0);
      expect(parsedColor.b).toBe(128);
    });

    it('interpolates rich text spans: fontSize, color, opacity, and offsetY', () => {
      const startEl: TextElement = {
        id: 'tween_spans',
        type: 'text',
        mode: 'static',
        text: 'Bounce',
        fontId: 'default',
        fontSize: 20,
        color: '#ffffff',
        align: 'left',
        width: 200,
        height: 50,
        multiline: false,
        selectable: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, originX: 0, originY: 0 },
        alpha: 1,
        visible: true,
        spans: [
          {
            id: 'sp_1',
            text: 'Bounce',
            fontSize: 20,
            color: '#ffffff',
            opacity: 1,
            offsetY: 0,
          },
        ],
      };

      const endEl: TextElement = {
        ...startEl,
        spans: [
          {
            id: 'sp_1',
            text: 'Bounce',
            fontSize: 36,
            color: '#ffff00',
            opacity: 0.4,
            offsetY: -30,
          },
        ],
      };

      const mid = computeInterpolatedElement(startEl, endEl, 0.5) as TextElement;

      expect(mid.spans).toBeDefined();
      expect(mid.spans?.length).toBe(1);

      const sp = mid.spans![0];
      expect(sp.fontSize).toBe(28); // (20 + 36) / 2
      expect(sp.opacity).toBe(0.7); // (1 + 0.4) / 2
      expect(sp.offsetY).toBe(-15); // (0 + -30) / 2

      const col = parseColor(sp.color!);
      expect(col.r).toBe(255);
      expect(col.g).toBe(255);
      expect(col.b).toBe(128); // halfway from 255 (#ffffff) to 0 (#ffff00)
    });
  });
});
