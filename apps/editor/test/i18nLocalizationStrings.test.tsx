import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Workspace } from '../src/layout/Workspace';
import { Localization } from '../src/panels/Localization/Localization';
import { Stage } from '../src/panels/Stage/Stage';
import { editorActions, useEditorStore, type EditorDocument } from '../src/state/editorStore';

describe('I18n Localization & Floating Strings Window', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Reset document with text elements
    const testDoc: EditorDocument = {
      meta: {
        name: 'I18n Test Animation',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        editorVersion: '0.1.0',
      },
      stage: {
        width: 800,
        height: 600,
        fps: 24,
        background: { type: 'solid', color: '#111827' },
      },
      library: {
        symbols: {},
        bitmaps: {},
        audio: {},
        videos: {},
        fonts: {},
      },
      root: {
        id: 'root-timeline',
        layers: [
          {
            id: 'text-layer-1',
            name: 'Hero Text',
            visible: true,
            locked: false,
            keyframes: [
              {
                id: 'kf-1',
                index: 0,
                duration: 24,
                elements: [
                  {
                    id: 'hero-title-el',
                    type: 'text',
                    text: 'Welcome to Flashback',
                    i18nKey: 'hero_headline',
                    transform: { x: 100, y: 150 },
                    fontId: 'default',
                    fontSize: 24,
                    color: '#ffffff',
                    selectable: true,
                  },
                  {
                    id: 'cta-button-el',
                    type: 'text',
                    text: 'Get Started Now',
                    transform: { x: 100, y: 220 },
                    fontId: 'default',
                    fontSize: 16,
                    color: '#ffffff',
                    selectable: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      i18n: {
        defaultLocale: 'en-US',
        locales: {
          'en-US': {
            hero_headline: 'Welcome to Flashback',
          },
          'es-ES': {
            hero_headline: 'Bienvenido a Flashback',
          },
        },
      },
    };

    act(() => {
      editorActions.loadDocument(testDoc);
      editorActions.setPreviewLocale('en-US');
      editorActions.setLocalizationOpen(false);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('can open and toggle the floating Strings & Localization window from actions and menu bar', () => {
    act(() => {
      root.render(<Workspace />);
    });

    // Initially window is closed
    expect(container.querySelector('[data-testid="localization-window"]')).toBeNull();

    // Toggle open
    act(() => {
      editorActions.toggleLocalization();
    });
    expect(container.querySelector('[data-testid="localization-window"]')).toBeTruthy();
    expect(container.textContent).toContain('Strings & Localization');

    // Toggle closed
    act(() => {
      editorActions.setLocalizationOpen(false);
    });
    expect(container.querySelector('[data-testid="localization-window"]')).toBeNull();
  });

  it('allows auto-extracting string keys from canvas text elements', () => {
    act(() => {
      root.render(<Localization />);
    });

    // Auto-extract should find 'cta-button-el' which has no i18nKey
    act(() => {
      const extractedCount = editorActions.autoExtractI18nStrings();
      expect(extractedCount).toBeGreaterThanOrEqual(1);
    });

    const doc = useEditorStore.getState().doc;
    const ctaEl = doc.root.layers[0].keyframes[0].elements.find((e) => e.id === 'cta-button-el') as any;
    expect(ctaEl.i18nKey).toBeTruthy();
    expect(doc.i18n?.locales['en-US']?.[ctaEl.i18nKey]).toBe('Get Started Now');
  });

  it('allows adding a new locale and editing per-locale translations directly in the table', () => {
    act(() => {
      root.render(<Localization />);
    });

    // Add French locale 'fr-FR'
    act(() => {
      editorActions.addI18nLocale('fr-FR');
    });

    const docAfterAdd = useEditorStore.getState().doc;
    expect(docAfterAdd.i18n?.locales['fr-FR']).toBeDefined();

    // Edit Spanish translation for 'hero_headline'
    act(() => {
      editorActions.setI18nTranslation('es-ES', 'hero_headline', '¡Hola Mundo!');
    });

    const docAfterEdit = useEditorStore.getState().doc;
    expect(docAfterEdit.i18n?.locales['es-ES']['hero_headline']).toBe('¡Hola Mundo!');
  });

  it('displays the active locale translation on stage and shows the preview banner', () => {
    act(() => {
      root.render(<Stage />);
    });

    // At en-US (default), shows 'Welcome to Flashback'
    expect(container.textContent).toContain('Welcome to Flashback');
    expect(container.querySelector('[data-testid="locale-preview-pill"]')).toBeNull();

    // Switch active preview locale to 'es-ES'
    act(() => {
      editorActions.setPreviewLocale('es-ES');
    });

    // Stage updates to Spanish translation
    expect(container.textContent).toContain('Bienvenido a Flashback');

    // Preview banner is displayed indicating translation preview
    const pill = container.querySelector('[data-testid="locale-preview-pill"]');
    expect(pill).toBeTruthy();
    expect(pill?.textContent).toContain('ES-ES');
  });

  it('adjusts text on the artboard for a specific translation directly in-place', () => {
    act(() => {
      root.render(<Stage />);
    });

    // Switch to es-ES preview
    act(() => {
      editorActions.setPreviewLocale('es-ES');
    });

    // Enter text editing on the hero title
    act(() => {
      editorActions.setEditingTextElId('hero-title-el');
    });

    // Editing textarea should open with Spanish translation draft
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('Bienvenido a Flashback');

    // Type a modified Spanish translation on the artboard
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(textarea, 'Bienvenido a Flashback Studio Pro');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      textarea.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });

    // Verify it updated the es-ES translation in doc.i18n
    const doc = useEditorStore.getState().doc;
    expect(doc.i18n?.locales['es-ES']['hero_headline']).toBe('Bienvenido a Flashback Studio Pro');

    // Default en-US text is preserved intact
    expect(doc.i18n?.locales['en-US']['hero_headline']).toBe('Welcome to Flashback');

    // Finish editing and switch preview back to en-US
    act(() => {
      editorActions.setEditingTextElId(null);
      editorActions.setPreviewLocale('en-US');
    });

    expect(container.textContent).toContain('Welcome to Flashback');
  });

  it('supports importing and merging third-party CMS JSON translations', () => {
    act(() => {
      root.render(<Localization />);
    });

    const cmsJson = JSON.stringify({
      locales: {
        'ja-JP': {
          hero_headline: 'Flashbackへようこそ',
        },
        'es-ES': {
          hero_headline: 'Bienvenido desde el CMS',
        },
      },
    });

    act(() => {
      editorActions.importI18nJson(cmsJson);
    });

    const doc = useEditorStore.getState().doc;
    expect(doc.i18n?.locales['ja-JP']?.hero_headline).toBe('Flashbackへようこそ');
    expect(doc.i18n?.locales['es-ES']?.hero_headline).toBe('Bienvenido desde el CMS');
  });
});
