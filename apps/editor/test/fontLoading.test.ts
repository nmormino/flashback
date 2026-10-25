import { describe, it, expect } from 'vitest';
import { editorActions, getEditorState } from '../src/state/editorStore';
import { parseFontMetadataFromUrl } from '../src/utils/fontParser';

describe('Web Font Importer & Typography Store', () => {
  it('adds a web font asset to document library', () => {
    editorActions.newDocument();

    const fontId = editorActions.addWebFont({
      name: 'Pacifico',
      url: 'https://fonts.googleapis.com/css2?family=Pacifico&display=swap',
      weight: 400,
      style: 'normal',
    });

    expect(fontId).toBe('font_pacifico');
    const doc = getEditorState().doc;
    expect(doc.library.fonts[fontId]).toBeDefined();
    expect(doc.library.fonts[fontId].family).toBe('Pacifico');
    expect(doc.library.fonts[fontId].src).toBe(
      'https://fonts.googleapis.com/css2?family=Pacifico&display=swap'
    );
    expect(doc.library.fonts[fontId].format).toBe('css');
  });

  it('can open and close add font modal state', () => {
    editorActions.setAddFontModalOpen(true);
    expect(getEditorState().addFontModalOpen).toBe(true);

    editorActions.setAddFontModalOpen(false);
    expect(getEditorState().addFontModalOpen).toBe(false);
  });

  describe('parseFontMetadataFromUrl', () => {
    it('detects variable font with continuous range (e.g. 100..900)', () => {
      const url =
        'https://fonts.googleapis.com/css2?family=Roboto:wght@100..900&display=swap';
      const meta = parseFontMetadataFromUrl(url);

      expect(meta.family).toBe('Roboto');
      expect(meta.fontType).toBe('variable');
      expect(meta.format).toBe('css');
      expect(meta.variableRange).toEqual({ min: 100, max: 900, default: 400 });
      expect(meta.availableStyles).toEqual(['normal']);
      expect(meta.style).toBe('normal');
    });

    it('detects variable font with italic and normal styles (ital,wght)', () => {
      const url =
        'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap';
      const meta = parseFontMetadataFromUrl(url);

      expect(meta.family).toBe('Inter');
      expect(meta.fontType).toBe('variable');
      expect(meta.variableRange).toEqual({ min: 100, max: 900, default: 400 });
      expect(meta.availableStyles).toEqual(['normal', 'italic']);
      expect(meta.style).toBe('all');
    });

    it('detects multi-weight font (e.g. wght@400;700)', () => {
      const url =
        'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap';
      const meta = parseFontMetadataFromUrl(url);

      expect(meta.family).toBe('Fira Code');
      expect(meta.fontType).toBe('multi');
      expect(meta.variableRange).toBeUndefined();
      expect(meta.availableWeights).toEqual([400, 700]);
      expect(meta.availableStyles).toEqual(['normal']);
      expect(meta.style).toBe('normal');
    });

    it('detects multi-weight font with normal and italic', () => {
      const url =
        'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&display=swap';
      const meta = parseFontMetadataFromUrl(url);

      expect(meta.family).toBe('Merriweather');
      expect(meta.fontType).toBe('multi');
      expect(meta.availableWeights).toEqual([300, 400, 700]);
      expect(meta.availableStyles).toEqual(['normal', 'italic']);
      expect(meta.style).toBe('all');
    });

    it('detects single-weight font', () => {
      const url =
        'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
      const meta = parseFontMetadataFromUrl(url);

      expect(meta.family).toBe('Press Start 2P');
      expect(meta.fontType).toBe('single');
      expect(meta.variableRange).toBeUndefined();
      expect(meta.availableWeights).toEqual([400]);
      expect(meta.availableStyles).toEqual(['normal']);
      expect(meta.style).toBe('normal');
    });

    it('detects custom variable range (e.g. Caveat 400..700)', () => {
      const url =
        'https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&display=swap';
      const meta = parseFontMetadataFromUrl(url);

      expect(meta.family).toBe('Caveat');
      expect(meta.fontType).toBe('variable');
      expect(meta.variableRange).toEqual({ min: 400, max: 700, default: 400 });
      expect(meta.availableStyles).toEqual(['normal']);
    });

    it('detects woff2 format from direct URL', () => {
      const url = 'https://example.com/fonts/inter-variable.woff2';
      const meta = parseFontMetadataFromUrl(url);

      expect(meta.format).toBe('woff2');
      expect(meta.fontType).toBe('single');
    });
  });

  describe('Variable and Multi-Weight Font State Updates', () => {
    it('stores variableRange, availableWeights, and availableStyles on FontAsset', () => {
      editorActions.newDocument();

      const fontId = editorActions.addWebFont({
        name: 'Inter',
        url: 'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100..900;1,100..900&display=swap',
        variableRange: { min: 100, max: 900, default: 400 },
        availableWeights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        availableStyles: ['normal', 'italic'],
        style: 'all',
      });

      const fontAsset = getEditorState().doc.library.fonts[fontId];
      expect(fontAsset).toBeDefined();
      expect(fontAsset.variableRange).toEqual({ min: 100, max: 900, default: 400 });
      expect(fontAsset.availableWeights).toHaveLength(9);
      expect(fontAsset.availableStyles).toEqual(['normal', 'italic']);
      expect(fontAsset.weight).toBe('100 900');
      expect(fontAsset.style).toBe('all');
    });

    it('stores discrete weights on multi-weight FontAsset', () => {
      editorActions.newDocument();

      const fontId = editorActions.addWebFont({
        name: 'Fira Code',
        url: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap',
        availableWeights: [400, 700],
        availableStyles: ['normal'],
        style: 'normal',
      });

      const fontAsset = getEditorState().doc.library.fonts[fontId];
      expect(fontAsset).toBeDefined();
      expect(fontAsset.availableWeights).toEqual([400, 700]);
      expect(fontAsset.weight).toEqual([400, 700]);
      expect(fontAsset.availableStyles).toEqual(['normal']);
      expect(fontAsset.variableRange).toBeUndefined();
    });

    it('updates text element with numeric variable font weight and styles', () => {
      editorActions.newDocument();

      // Add a text element to stage
      editorActions.addElement({
        id: 'text_1',
        type: 'text',
        mode: 'static',
        text: 'Dynamic Typography',
        fontId: 'default',
        fontSize: 24,
        fontWeight: 400,
        fontStyle: 'normal',
        color: '#ffffff',
        align: 'left',
        width: 200,
        height: 40,
        multiline: false,
        selectable: true,
        transform: {
          x: 50,
          y: 50,
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
      });

      // Update to variable font and precise weight
      const varFontId = editorActions.addWebFont({
        name: 'Inter',
        url: 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900',
        variableRange: { min: 100, max: 900, default: 400 },
        availableStyles: ['normal', 'italic'],
      });

      editorActions.updateElementProps('text_1', {
        fontId: varFontId,
        fontWeight: 632,
        fontStyle: 'italic',
      });

      const doc = getEditorState().doc;
      const el = doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'text_1'
      ) as any;
      expect(el).toBeDefined();
      expect(el.fontId).toBe(varFontId);
      expect(el.fontWeight).toBe(632);
      expect(el.fontStyle).toBe('italic');
    });
  });
});
