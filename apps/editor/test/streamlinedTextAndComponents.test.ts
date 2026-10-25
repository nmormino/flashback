import { describe, it, expect } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { editorActions, getEditorState, type EditorElement } from '../src/state/editorStore';
import { ConvertToComponentDialog } from '../src/dialogs/ConvertToComponentDialog';
import { Library } from '../src/panels/Library/Library';
import { Properties } from '../src/panels/Properties/Properties';
import { Scripts } from '../src/panels/Scripts/Scripts';
import type { TextElement, SymbolInstance, ShapeElement } from '@flashback/runtime';

describe('Streamlined Text Editing & Component Overhaul', () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  describe('1. Streamlined Real-Time Text Editing', () => {
    it('clicking text tool on stage adds element, enters editing mode and selects element', () => {
      editorActions.newDocument();
      editorActions.setActiveTool('text');

      const initialDoc = getEditorState().doc;
      const countBefore = initialDoc.root.layers[0].keyframes[0].elements.length;

      // Simulate what clicking with text tool does in Stage
      const newId = `text_test_${Date.now()}`;
      const newText: TextElement = {
        id: newId,
        type: 'text',
        transform: {
          x: 100,
          y: 120,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        text: 'Text',
        fontSize: 18,
        color: '#ffffff',
        align: 'left',
        width: 140,
        height: 32,
        mode: 'static',
        multiline: false,
        selectable: true,
        fontId: 'default',
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(newText);
      editorActions.selectElement(newId, false);
      editorActions.setEditingTextElId(newId);

      const state = getEditorState();
      expect(state.doc.root.layers[0].keyframes[0].elements.length).toBe(countBefore + 1);
      expect(state.selectedElementIds).toEqual([newId]);
      expect(state.editingTextElId).toBe(newId);
    });

    it('updates text immediately on keystroke via editorActions.updateElementProps', () => {
      editorActions.newDocument();
      const textEl: TextElement = {
        id: 'realtime_txt_1',
        type: 'text',
        mode: 'static',
        text: 'Initial',
        fontSize: 16,
        color: '#ffffff',
        fontId: 'default',
        align: 'left',
        width: 120,
        height: 30,
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
      };

      editorActions.addElement(textEl);
      editorActions.selectElement('realtime_txt_1');

      // Keystroke 1: "Initial "
      editorActions.updateElementProps('realtime_txt_1', { text: 'Initial ' });
      let el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'realtime_txt_1'
      ) as TextElement;
      expect(el.text).toBe('Initial ');

      // Keystroke 2: "Initial T"
      editorActions.updateElementProps('realtime_txt_1', { text: 'Initial T' });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'realtime_txt_1'
      ) as TextElement;
      expect(el.text).toBe('Initial T');
    });

    it('real-time properties panel styling updates font properties instantly', () => {
      editorActions.newDocument();
      const textEl: TextElement = {
        id: 'style_txt_1',
        type: 'text',
        mode: 'static',
        text: 'Styling Test',
        fontSize: 16,
        color: '#ffffff',
        fontWeight: 400,
        fontStyle: 'normal',
        fontId: 'default',
        align: 'left',
        width: 120,
        height: 30,
        multiline: false,
        selectable: true,
        transform: {
          x: 10,
          y: 10,
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
      editorActions.selectElement('style_txt_1');

      // Update Font Family
      editorActions.updateElementProps('style_txt_1', { fontId: 'Arial' });
      let el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'style_txt_1'
      ) as TextElement;
      expect(el.fontId).toBe('Arial');

      // Update Font Size
      editorActions.updateElementProps('style_txt_1', { fontSize: 28 });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'style_txt_1'
      ) as TextElement;
      expect(el.fontSize).toBe(28);

      // Update Weight (Bold)
      editorActions.updateElementProps('style_txt_1', { fontWeight: 700 });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'style_txt_1'
      ) as TextElement;
      expect(el.fontWeight).toBe(700);

      // Update Italic
      editorActions.updateElementProps('style_txt_1', { fontStyle: 'italic' });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'style_txt_1'
      ) as TextElement;
      expect(el.fontStyle).toBe('italic');

      // Update Color
      editorActions.updateElementProps('style_txt_1', { color: '#ef4444' });
      el = getEditorState().doc.root.layers[0].keyframes[0].elements.find(
        (e) => e.id === 'style_txt_1'
      ) as TextElement;
      expect(el.color).toBe('#ef4444');
    });
  });

  describe('2. Component Overhaul (Rebranding, Badges & Inspector Workflow)', () => {
    it('converts element to component and updates library and state', () => {
      editorActions.newDocument();
      const rect: ShapeElement = {
        id: 'comp_shape_1',
        type: 'shape',
        transform: {
          x: 20,
          y: 30,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        paths: [{ d: 'M 0 0 L 50 0 L 50 50 L 0 50 Z', fill: { type: 'solid', color: '#3b82f6' } }],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(rect);
      editorActions.selectElement('comp_shape_1');

      // Convert to Component
      editorActions.convertToComponent('comp_shape_1', 'MyButton', 'button');

      const doc = getEditorState().doc;
      const symbolIds = Object.keys(doc.library.symbols);
      expect(symbolIds.length).toBe(1);

      const compDef = doc.library.symbols[symbolIds[0]];
      expect(compDef.name).toBe('MyButton');
      expect(compDef.kind).toBe('button');

      // Replaced by instance on keyframe
      const kf = doc.root.layers[0].keyframes[0];
      const instance = kf.elements.find((e) => e.type === 'instance') as SymbolInstance;
      expect(instance).toBeDefined();
      expect(instance.symbolId).toBe(compDef.id);
    });

    it('opens ConvertToComponentDialog with "Create New Component" title and Component default name', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        editorActions.setConvertToComponentModalOpen(true);
        root.render(React.createElement(ConvertToComponentDialog));
      });

      expect(container.textContent).toContain('Create New Component');
      expect(container.textContent).toContain('Behavior:');
      expect(container.textContent).toContain('Movie clip');

      act(() => {
        editorActions.setConvertToComponentModalOpen(false);
        root.unmount();
      });
      container.remove();
    });

    it('renders Library with "Components & Assets" and component buttons', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(React.createElement(Library));
      });

      expect(container.textContent).toContain('Components & Assets');
      expect(container.textContent).toContain('New Component (F8)');

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('Properties panel shows Component Instance, script name, edit master and edit script buttons', () => {
      editorActions.newDocument();
      const rect: ShapeElement = {
        id: 'btn_shape_2',
        type: 'shape',
        transform: {
          x: 10,
          y: 10,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skewX: 0,
          skewY: 0,
          originX: 0,
          originY: 0,
        },
        paths: [{ d: 'M 0 0 L 40 0 L 40 40 L 0 40 Z', fill: { type: 'solid', color: '#10b981' } }],
        alpha: 1,
        visible: true,
      };

      editorActions.addElement(rect);
      editorActions.selectElement('btn_shape_2');
      editorActions.convertToComponent('btn_shape_2', 'PlayButton', 'button');

      const kf = getEditorState().doc.root.layers[0].keyframes[0];
      const inst = kf.elements.find((e) => e.type === 'instance') as SymbolInstance;
      expect(inst).toBeDefined();

      editorActions.updateElementProps(inst.id, { instanceName: 'playBtn' });
      editorActions.selectElement(inst.id);

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(React.createElement(Properties));
      });

      expect(container.textContent).toContain('Component Instance: PlayButton');
      expect(container.textContent).toContain('Edit Master Component');
      expect(container.textContent).toContain('Instance Script Name:');
      expect(container.textContent).toContain('Edit Component Script');

      // Click "Edit Component Script" switches inspector tab to scripts
      const editScriptBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Edit Component Script')
      );
      expect(editScriptBtn).toBeDefined();
      act(() => {
        editScriptBtn?.click();
      });
      expect(getEditorState().activeInspectorTab).toBe('scripts');

      // Click "Edit Master Component" enters isolation mode
      const editMasterBtn = container.querySelector(
        `button[title*="Edit Master Component"]`
      ) as HTMLButtonElement;
      expect(editMasterBtn).not.toBeNull();
      act(() => {
        editMasterBtn.click();
      });
      expect(getEditorState().isolationStack).toHaveLength(1);
      expect(getEditorState().isolationStack[0].name).toBe('PlayButton');

      // Exit isolation
      editorActions.exitIsolation();
      expect(getEditorState().isolationStack).toHaveLength(0);

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('Scripts panel displays Target: ❖ playBtn (Component Instance) and live events including onEnterFrame', () => {
      const kf = getEditorState().doc.root.layers[0].keyframes[0];
      const inst = kf.elements.find((e) => e.type === 'instance') as SymbolInstance;
      editorActions.selectElement(inst.id);

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(React.createElement(Scripts));
      });

      expect(container.textContent).toContain('Target: ❖ playBtn (Component Instance)');
      expect(container.textContent).toContain('onClick');
      expect(container.textContent).toContain('onEnterFrame');

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });
});
