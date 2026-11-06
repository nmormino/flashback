import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  editorActions,
  getEditorState,
  adjustElementForPin,
} from '../src/state/editorStore';
import {
  getElementBounds,
  computeInterpolatedElement,
  parseVideoEmbed,
} from '../src/panels/Stage/Stage';
import { Properties } from '../src/panels/Properties/Properties';
import { Layers } from '../src/panels/Layers/Layers';
import { Tools } from '../src/panels/Tools/Tools';
import type {
  BitmapElement,
  VideoElement,
  ShapeElement,
  TextElement,
  StageBreakpoint,
} from '@flashback/runtime';

describe('Workstream 3: Media Elements, Layer Masks, Alignment & Properties Inspector', () => {
  beforeEach(() => {
    editorActions.newDocument();
  });

  describe('1. Raster Image (BitmapElement) & Video (VideoElement) Support', () => {
    it('addBitmapElement registers a BitmapAsset in doc.library.bitmaps and adds BitmapElement to active keyframe', () => {
      const src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      editorActions.addBitmapElement(src, 'MyLogo', 200, 150);

      const state = getEditorState();
      const bitmapAssets = Object.values(state.doc.library.bitmaps || {});
      expect(bitmapAssets.length).toBeGreaterThan(0);
      const asset = bitmapAssets[0];
      expect(asset.name).toBe('MyLogo');
      expect(asset.src).toBe(src);
      expect(asset.width).toBe(200);
      expect(asset.height).toBe(150);

      const kf = state.doc.root.layers[0].keyframes[0];
      const el = kf.elements.find((e) => e.type === 'bitmap') as BitmapElement;
      expect(el).toBeDefined();
      expect(el.type).toBe('bitmap');
      expect(el.bitmapId).toBe(asset.id);
      expect(el.src).toBe(src);
      expect(el.width).toBe(200);
      expect(el.height).toBe(150);
      expect(state.selectedElementIds).toContain(el.id);
    });

    it('addVideoElement adds VideoElement with default properties and controls', () => {
      const videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
      editorActions.addVideoElement(videoUrl, 480, 270);

      const state = getEditorState();
      const kf = state.doc.root.layers[0].keyframes[0];
      const el = kf.elements.find((e) => e.type === 'video') as VideoElement;
      expect(el).toBeDefined();
      expect(el.type).toBe('video');
      expect(el.src).toBe(videoUrl);
      expect(el.width).toBe(480);
      expect(el.height).toBe(270);
      expect(el.autoplay).toBe(true);
      expect(el.loop).toBe(true);
      expect(el.muted).toBe(true);
      expect(el.controls).toBe(true);
      expect(state.selectedElementIds).toContain(el.id);
    });

    it('updateElementProps updates BitmapElement and VideoElement props', () => {
      editorActions.addBitmapElement('https://example.com/initial.png', 'Initial', 100, 100);
      const state = getEditorState();
      const bmpId = state.selectedElementIds[0];

      editorActions.updateElementProps(bmpId, {
        src: 'https://example.com/updated.png',
        width: 300,
        height: 200,
      });

      const updatedDoc = getEditorState().doc;
      const bmp = updatedDoc.root.layers[0].keyframes[0].elements.find((e) => e.id === bmpId) as BitmapElement;
      expect(bmp.src).toBe('https://example.com/updated.png');
      expect(bmp.width).toBe(300);
      expect(bmp.height).toBe(200);

      // Also checks sync with library asset
      expect(updatedDoc.library.bitmaps[bmp.bitmapId]?.src).toBe('https://example.com/updated.png');
    });

    it('computes correct bounds for bitmap and video elements via getElementBounds', () => {
      const bmpEl: BitmapElement = {
        id: 'bmp_test',
        type: 'bitmap',
        bitmapId: 'b1',
        src: 'https://example.com/img.png',
        width: 320,
        height: 240,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 },
        alpha: 1,
        visible: true,
      };
      const bmpBounds = getElementBounds(bmpEl);
      expect(bmpBounds.width).toBe(320);
      expect(bmpBounds.height).toBe(240);

      const vidEl: VideoElement = {
        id: 'vid_test',
        type: 'video',
        src: 'https://example.com/vid.mp4',
        width: 640,
        height: 360,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 },
        alpha: 1,
        visible: true,
      };
      const vidBounds = getElementBounds(vidEl);
      expect(vidBounds.width).toBe(640);
      expect(vidBounds.height).toBe(360);
    });

    it('computeInterpolatedElement smoothly interpolates bitmap and video dimensions and transforms across tweens', () => {
      const bmpStart: BitmapElement = {
        id: 'bmp_anim',
        type: 'bitmap',
        bitmapId: 'b1',
        width: 100,
        height: 100,
        alpha: 1,
        visible: true,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 },
      };
      const bmpEnd: BitmapElement = {
        id: 'bmp_anim',
        type: 'bitmap',
        bitmapId: 'b1',
        width: 200,
        height: 300,
        alpha: 0.5,
        visible: true,
        transform: { x: 100, y: 200, scaleX: 2, scaleY: 2, rotation: 90, skewX: 0, skewY: 0 },
      };

      const interpolatedBmp = computeInterpolatedElement(bmpStart, bmpEnd, 0.5) as BitmapElement;
      expect(interpolatedBmp.type).toBe('bitmap');
      expect(interpolatedBmp.width).toBe(150);
      expect(interpolatedBmp.height).toBe(200);
      expect(interpolatedBmp.alpha).toBeCloseTo(0.75);
      expect(interpolatedBmp.transform.x).toBe(50);
      expect(interpolatedBmp.transform.y).toBe(100);
      expect(interpolatedBmp.transform.rotation).toBe(45);
    });

    it('parseVideoEmbed identifies YouTube and Vimeo links and builds embed URLs', () => {
      const yt1 = parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(yt1.isEmbed).toBe(true);
      expect(yt1.platform).toBe('youtube');
      expect(yt1.embedUrl).toContain('dQw4w9WgXcQ');

      const yt2 = parseVideoEmbed('https://youtu.be/dQw4w9WgXcQ');
      expect(yt2.isEmbed).toBe(true);
      expect(yt2.platform).toBe('youtube');
      expect(yt2.embedUrl).toContain('dQw4w9WgXcQ');

      const vimeo = parseVideoEmbed('https://vimeo.com/76979871');
      expect(vimeo.isEmbed).toBe(true);
      expect(vimeo.platform).toBe('vimeo');
      expect(vimeo.embedUrl).toContain('76979871');

      const direct = parseVideoEmbed('https://example.com/video.mp4');
      expect(direct.isEmbed).toBe(false);
      expect(direct.platform).toBe('video');
    });
  });

  describe('2. Layer Masks (kind: "mask" & maskLayerId)', () => {
    it('toggleLayerMask toggles layer kind between normal and mask, and links layer directly below it', () => {
      // Setup 2 layers: Layer 1 (top), Layer 2 (bottom)
      editorActions.addLayer('Layer 2'); // Adds at top, so Layer 2 is index 0, Layer 1 is index 1
      const layers = getEditorState().doc.root.layers;
      expect(layers.length).toBe(2);

      const topLayerId = layers[0].id;
      const bottomLayerId = layers[1].id;

      // Toggle top layer to mask
      editorActions.toggleLayerMask(topLayerId);
      const afterMask = getEditorState().doc.root.layers;
      expect(afterMask[0].kind).toBe('mask');
      expect(afterMask[1].maskLayerId).toBe(topLayerId);

      // Toggle top layer back to normal
      editorActions.toggleLayerMask(topLayerId);
      const afterNormal = getEditorState().doc.root.layers;
      expect(afterNormal[0].kind).toBe('normal');
      expect(afterNormal[1].maskLayerId).toBeUndefined();
    });

    it('setLayerMaskId allows any layer to explicitly set or clear its maskLayerId', () => {
      editorActions.addLayer('MaskLayer');
      editorActions.addLayer('TargetLayer');

      const state = getEditorState();
      const maskLayer = state.doc.root.layers.find((l) => l.name === 'MaskLayer')!;
      const targetLayer = state.doc.root.layers.find((l) => l.name === 'TargetLayer')!;

      editorActions.setLayerKind(maskLayer.id, 'mask');
      editorActions.setLayerMaskId(targetLayer.id, maskLayer.id);

      let doc = getEditorState().doc;
      let tgt = doc.root.layers.find((l) => l.id === targetLayer.id)!;
      expect(tgt.maskLayerId).toBe(maskLayer.id);

      // Clear mask
      editorActions.setLayerMaskId(targetLayer.id, undefined);
      doc = getEditorState().doc;
      tgt = doc.root.layers.find((l) => l.id === targetLayer.id)!;
      expect(tgt.maskLayerId).toBeUndefined();
    });
  });

  describe('3. Responsive Breakpoints & Pinning', () => {
    it('adjustElementForPin handles center, top-right, bottom-left, bottom-right, and stretch pins', () => {
      const el: any = {
        id: 'test_pin',
        transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, pin: 'center' },
      };

      // Resizing from 500x400 to 700x600: dx = +200, dy = +200
      adjustElementForPin(el, 500, 400, 700, 600);
      expect(el.transform.x).toBe(200); // 100 + 200/2
      expect(el.transform.y).toBe(200); // 100 + 200/2

      // Test top-right: x shifts by dx (+100), y stays
      el.transform = { x: 100, y: 100, pin: 'top-right' };
      adjustElementForPin(el, 500, 400, 600, 400);
      expect(el.transform.x).toBe(200);
      expect(el.transform.y).toBe(100);

      // Test bottom-right: x and y shift by dx and dy
      el.transform = { x: 50, y: 50, pin: 'bottom-right' };
      adjustElementForPin(el, 400, 300, 500, 400);
      expect(el.transform.x).toBe(150);
      expect(el.transform.y).toBe(150);

      // Test stretch: scaleX and scaleY scale proportionally
      el.transform = { x: 100, y: 50, scaleX: 1, scaleY: 1, pin: 'stretch' };
      adjustElementForPin(el, 500, 400, 1000, 800);
      expect(el.transform.scaleX).toBe(2);
      expect(el.transform.scaleY).toBe(2);
      expect(el.transform.x).toBe(200);
      expect(el.transform.y).toBe(100);
    });

    it('applyBreakpoint resizes stage and adjusts pinned elements across timelines', () => {
      // Add pinned element
      const pinnedEl: any = {
        id: 'pinned_box',
        type: 'shape',
        transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, pin: 'center' },
        paths: [{ d: 'M0 0 L50 0 L50 50 Z' }],
        alpha: 1,
        visible: true,
      };
      editorActions.addElement(pinnedEl);

      const bp: StageBreakpoint = {
        id: 'bp_tablet',
        name: 'Tablet',
        maxWidth: 768,
        width: 750, // 550 + 200 -> dx = 200
        height: 500, // 400 + 100 -> dy = 100
      };

      editorActions.applyBreakpoint(bp);

      const state = getEditorState();
      expect(state.doc.stage.width).toBe(750);
      expect(state.doc.stage.height).toBe(500);
      expect(state.activeBreakpointId).toBe('bp_tablet');

      const found = state.doc.root.layers[0].keyframes[0].elements.find((e) => e.id === 'pinned_box');
      expect(found?.transform.x).toBe(200); // 100 + 200/2
      expect(found?.transform.y).toBe(150); // 100 + 100/2
    });

    it('manages breakpoints with addBreakpoint and removeBreakpoint', () => {
      editorActions.addBreakpoint({
        id: 'bp_custom',
        name: 'Custom Breakpoint',
        maxWidth: 600,
        width: 480,
        height: 320,
      });

      let bps = getEditorState().doc.stage.breakpoints || [];
      expect(bps.some((b) => b.id === 'bp_custom')).toBe(true);

      editorActions.removeBreakpoint('bp_custom');
      bps = getEditorState().doc.stage.breakpoints || [];
      expect(bps.some((b) => b.id === 'bp_custom')).toBe(false);
    });
  });

  describe('4. Accessibility (Reduced Motion) & i18n Localization', () => {
    it('setReducedMotion configures mode, posterFrame, and stopMotionFps in stage properties', () => {
      editorActions.setReducedMotion({
        mode: 'fixed',
        posterFrame: 5,
      });

      let rm = getEditorState().doc.stage.reducedMotion;
      expect(rm?.mode).toBe('fixed');
      expect(rm?.posterFrame).toBe(5);

      editorActions.setReducedMotion({
        mode: 'stop-motion',
        stopMotionFps: 8,
      });

      rm = getEditorState().doc.stage.reducedMotion;
      expect(rm?.mode).toBe('stop-motion');
      expect(rm?.stopMotionFps).toBe(8);
    });

    it('manages i18n dictionary and preview locale', () => {
      editorActions.updateI18n({
        defaultLocale: 'en',
        locales: {
          en: { hero_title: 'Welcome to Flashback' },
          es: { hero_title: 'Bienvenido a Flashback' },
        },
      });

      let doc = getEditorState().doc;
      expect(doc.i18n?.defaultLocale).toBe('en');
      expect(doc.i18n?.locales.es.hero_title).toBe('Bienvenido a Flashback');

      editorActions.setI18nTranslation('fr', 'hero_title', 'Bienvenue sur Flashback');
      doc = getEditorState().doc;
      expect(doc.i18n?.locales.fr.hero_title).toBe('Bienvenue sur Flashback');

      editorActions.setPreviewLocale('es');
      expect(getEditorState().previewLocale).toBe('es');
    });
  });

  describe('5. Inspector UI Integration (Properties & Alignment Toolbar)', () => {
    it('renders alignment toolbar and handles 6-axis alignment relative to stage dimensions', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      // Stage size 550x400
      const testEl: ShapeElement = {
        id: 'align_test_el',
        type: 'shape',
        transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 },
        paths: [{ d: 'M 0 0 L 100 0 L 100 100 L 0 100 Z' }], // 100x100 box
        alpha: 1,
        visible: true,
      };

      act(() => {
        editorActions.addElement(testEl);
        editorActions.selectElements(['align_test_el']);
        root.render(React.createElement(Properties));
      });

      const alignLeftBtn = container.querySelector('[data-testid="align-left-btn"]') as HTMLButtonElement;
      const alignHCenterBtn = container.querySelector('[data-testid="align-hcenter-btn"]') as HTMLButtonElement;
      const alignRightBtn = container.querySelector('[data-testid="align-right-btn"]') as HTMLButtonElement;
      const alignTopBtn = container.querySelector('[data-testid="align-top-btn"]') as HTMLButtonElement;
      const alignVCenterBtn = container.querySelector('[data-testid="align-vcenter-btn"]') as HTMLButtonElement;
      const alignBottomBtn = container.querySelector('[data-testid="align-bottom-btn"]') as HTMLButtonElement;

      expect(alignLeftBtn).toBeTruthy();
      expect(alignHCenterBtn).toBeTruthy();
      expect(alignRightBtn).toBeTruthy();
      expect(alignTopBtn).toBeTruthy();
      expect(alignVCenterBtn).toBeTruthy();
      expect(alignBottomBtn).toBeTruthy();

      // Test Align Left -> x = 0
      act(() => {
        alignLeftBtn.click();
      });
      let el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.x).toBe(0);

      // Test Align Horizontal Center -> x = (550 - 100) / 2 = 225
      act(() => {
        alignHCenterBtn.click();
      });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.x).toBe(225);

      // Test Align Right -> x = 550 - 100 = 450
      act(() => {
        alignRightBtn.click();
      });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.x).toBe(450);

      // Test Align Top -> y = 0
      act(() => {
        alignTopBtn.click();
      });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.y).toBe(0);

      // Test Align Vertical Center -> y = (400 - 100) / 2 = 150
      act(() => {
        alignVCenterBtn.click();
      });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.y).toBe(150);

      // Test Align Bottom -> y = 400 - 100 = 300
      act(() => {
        alignBottomBtn.click();
      });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements[0];
      expect(el.transform.y).toBe(300);

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('renders Toolbar quick insert buttons for Image and Video', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(React.createElement(Tools));
      });

      const insertImageBtn = container.querySelector('[data-testid="insert-image-btn"]');
      const insertVideoBtn = container.querySelector('[data-testid="insert-video-btn"]');
      expect(insertImageBtn).toBeTruthy();
      expect(insertVideoBtn).toBeTruthy();

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('renders Layers panel with Mask toggle button and toggles mask status', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const layerId = getEditorState().doc.root.layers[0].id;

      act(() => {
        root.render(React.createElement(Layers));
      });

      const maskToggleBtn = container.querySelector(`[data-testid="mask-toggle-${layerId}"]`) as HTMLButtonElement;
      expect(maskToggleBtn).toBeTruthy();

      act(() => {
        maskToggleBtn.click();
      });

      const state = getEditorState();
      expect(state.doc.root.layers[0].kind).toBe('mask');

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });
});
