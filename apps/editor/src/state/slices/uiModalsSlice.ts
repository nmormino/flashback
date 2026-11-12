import type { Easing, Fill, FontAsset } from '@flashback/runtime';
import type {
  ContextMenuItem,
  EditorTool,
  SliceContext,
  SliceCreator,
  UiModalsSliceActions,
} from './types';
import { fastClone } from './historySlice';

export const createUiModalsSlice: SliceCreator<UiModalsSliceActions> = (
  context: SliceContext
): UiModalsSliceActions => {
  return {
    setActiveTool(tool: EditorTool): void {
      context.setState({ activeTool: tool });
    },

    setFillColor(color: string): void {
      context.setState({
        fillColor: color,
        activeFill: {
          type: 'solid',
          color,
        },
      });
    },

    setActiveFill(fill: Fill): void {
      const color =
        fill.type === 'solid'
          ? fill.color
          : fill.type === 'linearGradient' || fill.type === 'radialGradient'
          ? fill.stops[0]?.color ?? '#ffffff'
          : '#ffffff';
      context.setState({
        activeFill: fill,
        fillColor: color,
      });
    },

    setStrokeColor(color: string): void {
      context.setState({
        strokeColor: color,
        activeStroke: {
          type: 'solid',
          color,
        },
      });
    },

    setActiveStroke(fill: Fill): void {
      const color =
        fill.type === 'solid'
          ? fill.color
          : fill.type === 'linearGradient' || fill.type === 'radialGradient'
          ? fill.stops[0]?.color ?? '#000000'
          : '#000000';
      context.setState({
        activeStroke: fill,
        strokeColor: color,
      });
    },

    setStrokeWidth(width: number): void {
      context.setState({ strokeWidth: Math.max(0, width) });
    },

    setTestMovieOpen(open: boolean): void {
      context.setState({ testMovieOpen: open });
    },

    setExportModalOpen(open: boolean): void {
      context.setState({ exportModalOpen: open });
    },

    setImportModalOpen(open: boolean): void {
      context.setState({ importModalOpen: open });
    },

    setActiveInspectorTab(tab: 'timeline' | 'statemachine' | 'scripts' | 'properties'): void {
      context.setState({ activeInspectorTab: tab });
    },

    setConvertToComponentModalOpen(open: boolean): void {
      context.setState({ convertToComponentModalOpen: open });
    },

    setConvertToSymbolModalOpen(open: boolean): void {
      context.setState({ convertToSymbolModalOpen: open });
    },

    setAddFontModalOpen(open: boolean): void {
      context.setState({ addFontModalOpen: open });
    },

    openBezierEditor(layerId: string, kfId: string, initialEasing?: Easing): void {
      context.setState({
        bezierModalOpen: true,
        activeBezierTarget: { layerId, kfId, initialEasing },
      });
    },

    closeBezierEditor(): void {
      context.setState({
        bezierModalOpen: false,
        activeBezierTarget: null,
      });
    },

    addWebFont(font: {
      name: string;
      url: string;
      format?: 'woff2' | 'css';
      weight?: number | `${number} ${number}` | number[];
      style?: 'normal' | 'italic' | 'all';
      variableRange?: { min: number; max: number; default?: number };
      availableWeights?: number[];
      availableStyles?: Array<'normal' | 'italic'>;
    }): string {
      context.pushHistorySnapshot();
      const state = context.getState();
      const doc = fastClone(state.doc);
      const id = `font_${font.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      const isCss = font.url.includes('.css') || font.url.includes('googleapis.com');
      const format: 'woff2' | 'css' = font.format || (isCss ? 'css' : 'woff2');

      let weight: number | `${number} ${number}` | number[] = 400;
      if (font.variableRange) {
        weight = `${font.variableRange.min} ${font.variableRange.max}` as `${number} ${number}`;
      } else if (font.availableWeights && font.availableWeights.length > 0) {
        weight =
          font.availableWeights.length === 1 ? font.availableWeights[0] : font.availableWeights;
      } else if (font.weight !== undefined) {
        weight = font.weight;
      }

      const availableStyles =
        font.availableStyles ||
        (font.style === 'all'
          ? ['normal', 'italic']
          : font.style
          ? [font.style]
          : ['normal']);
      const style: 'normal' | 'italic' | 'all' =
        font.style ||
        (availableStyles.includes('italic') && availableStyles.includes('normal')
          ? 'all'
          : availableStyles.includes('italic')
          ? 'italic'
          : 'normal');

      const fontAsset: FontAsset = {
        id,
        family: font.name,
        src: font.url,
        format,
        weight,
        style,
        ...(font.variableRange ? { variableRange: font.variableRange } : {}),
        ...(font.availableWeights ? { availableWeights: font.availableWeights } : {}),
        ...(font.availableStyles ? { availableStyles } : {}),
      };

      doc.library.fonts[id] = fontAsset;

      const isTest =
        typeof (globalThis as any).process !== 'undefined' &&
        (globalThis as any).process?.env?.NODE_ENV === 'test';
      if (typeof document !== 'undefined' && !isTest) {
        if (format === 'css' || isCss) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = font.url;
          document.head.appendChild(link);
        } else if (typeof FontFace !== 'undefined') {
          try {
            const descriptors: FontFaceDescriptors = {};
            if (font.variableRange) {
              descriptors.weight = `${font.variableRange.min} ${font.variableRange.max}`;
            } else if (typeof weight === 'number') {
              descriptors.weight = String(weight);
            }
            if (style === 'all') {
              descriptors.style = 'normal italic';
            } else if (style) {
              descriptors.style = style;
            }
            const face = new FontFace(font.name, `url("${font.url}")`, descriptors);
            (document.fonts as any).add(face);
            face.load().catch(() => {});
          } catch {
            // ignore font loading error
          }
        }
      }

      context.setState({ doc });
      return id;
    },

    openContextMenu(menu: { x: number; y: number; items: ContextMenuItem[] }): void {
      context.setState({
        contextMenu: {
          isOpen: true,
          x: menu.x,
          y: menu.y,
          items: menu.items,
        },
      });
    },

    closeContextMenu(): void {
      const state = context.getState();
      if (state.contextMenu) {
        context.setState({ contextMenu: null });
      }
    },

    setLibraryOpen(open: boolean): void {
      context.setState({ isLibraryOpen: open });
    },

    toggleLibrary(): void {
      const state = context.getState();
      const isDocked = state.dockedPanels?.clips ?? true;
      if (isDocked) {
        if (!state.isLibraryOpen) {
          context.setState({
            isLibraryOpen: true,
            collapsedPanels: { ...(state.collapsedPanels || { properties: false, clips: false }), clips: false },
          });
        } else if (state.collapsedPanels?.clips) {
          context.setState({
            collapsedPanels: { ...(state.collapsedPanels || { properties: false, clips: false }), clips: false },
          });
        } else {
          context.setState({
            isLibraryOpen: false,
            collapsedPanels: { ...(state.collapsedPanels || { properties: false, clips: false }), clips: true },
          });
        }
      } else {
        context.setState({ isLibraryOpen: !state.isLibraryOpen });
      }
    },

    setLibraryPosition(pos: { x: number; y: number }): void {
      const state = context.getState();
      context.setState({
        libraryPosition: pos,
        floatingPanelPositions: {
          ...(state.floatingPanelPositions || { properties: { x: 450, y: 70 }, clips: { x: 300, y: 120 } }),
          clips: pos,
        },
      });
    },

    setLocalizationOpen(open: boolean): void {
      context.setState({ isLocalizationOpen: open });
    },

    toggleLocalization(): void {
      const state = context.getState();
      context.setState({ isLocalizationOpen: !state.isLocalizationOpen });
    },

    setLocalizationPosition(pos: { x: number; y: number }): void {
      context.setState({ localizationPosition: pos });
    },

    setStateVariablesOpen(open: boolean): void {
      context.setState({ isStateVariablesOpen: open });
    },

    toggleStateVariables(): void {
      const state = context.getState();
      context.setState({ isStateVariablesOpen: !state.isStateVariablesOpen });
    },

    setStateVariablesPosition(pos: { x: number; y: number }): void {
      context.setState({ stateVariablesPosition: pos });
    },

    setPanelDocked(panelId: 'properties' | 'clips', docked: boolean): void {
      const state = context.getState();
      const dockedPanels = {
        ...(state.dockedPanels || { properties: true, clips: true }),
        [panelId]: docked,
      };
      const updates: any = { dockedPanels };
      if (panelId === 'clips' && docked) {
        updates.isLibraryOpen = true;
      }
      context.setState(updates);
    },

    togglePanelCollapse(panelId: 'properties' | 'clips'): void {
      const state = context.getState();
      const current = state.collapsedPanels?.[panelId] ?? false;
      context.setState({
        collapsedPanels: {
          ...(state.collapsedPanels || { properties: false, clips: false }),
          [panelId]: !current,
        },
      });
    },

    setFloatingPanelPosition(panelId: 'properties' | 'clips', pos: { x: number; y: number }): void {
      const state = context.getState();
      const floatingPanelPositions = {
        ...(state.floatingPanelPositions || { properties: { x: 450, y: 70 }, clips: { x: 300, y: 120 } }),
        [panelId]: pos,
      };
      const updates: any = { floatingPanelPositions };
      if (panelId === 'clips') {
        updates.libraryPosition = pos;
      }
      context.setState(updates);
    },
  };
};
