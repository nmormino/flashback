import React, { useState, useEffect, useRef } from 'react';
import type { SymbolInstance } from '@flashback/runtime';
import {
  useEditorStore,
  editorActions,
  findKeyframeAt,
  type EditorElement,
} from '../../state/editorStore';
import styles from './Scripts.module.css';

interface SnippetItem {
  title: string;
  code: string;
}

interface SnippetCategory {
  category: string;
  items: SnippetItem[];
}

export const Scripts: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);

  const [selectedEvent, setSelectedEvent] = useState<string>('onClick');
  const [codeDraft, setCodeDraft] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Determine target: Selected Element vs Frame
  let selectedEl: EditorElement | null = null;
  const targetLayer =
    doc.root.layers.find((l) => l.id === selectedLayerId) || doc.root.layers[0];

  if (targetLayer) {
    const kf = findKeyframeAt(targetLayer, currentFrame);
    if (kf) {
      const found = kf.elements.find((e) => selectedElementIds.includes(e.id));
      if (found) {
        selectedEl = found;
      }
    }
  }

  const isEditingObject = Boolean(selectedEl);

  // Sync draft from document whenever target changes
  useEffect(() => {
    setStatusMsg(null);
    if (selectedEl && selectedEl.type === 'instance') {
      const inst = selectedEl as SymbolInstance;
      const fnObj = (inst.events as Record<string, { __fn?: string }> | undefined)?.[selectedEvent];
      setCodeDraft(fnObj?.__fn || '');
    } else if (targetLayer) {
      const kf = findKeyframeAt(targetLayer, currentFrame);
      const fnObj = kf?.actions as { __fn?: string } | undefined;
      setCodeDraft(fnObj?.__fn || '');
    }
  }, [selectedEl?.id, targetLayer?.id, currentFrame, selectedEvent]);

  // Synchronize textarea scroll with line numbers
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleApply = () => {
    if (codeDraft.trim()) {
      try {
        new Function('e', codeDraft);
        setStatusMsg({ text: 'Syntax valid · Script bound live', isError: false });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusMsg({ text: `Syntax error: ${msg}`, isError: true });
        return;
      }
    } else {
      setStatusMsg({ text: 'Script cleared', isError: false });
    }

    if (isEditingObject && selectedEl) {
      editorActions.updateElementScript(selectedEl.id, selectedEvent, codeDraft);
    } else if (targetLayer) {
      editorActions.updateKeyframeScript(targetLayer.id, currentFrame, codeDraft);
    }
  };

  const handleQuickInsert = (snippetCode: string) => {
    setCodeDraft((prev) => (prev.trim() ? `${prev}\n${snippetCode}` : snippetCode));
    setStatusMsg({ text: 'Snippet inserted. Press Apply to bind.', isError: false });
  };

  const handleFormat = () => {
    const lines = codeDraft.split('\n');
    const formatted = lines
      .map((l) => l.trimEnd())
      .join('\n')
      .trim();
    setCodeDraft(formatted);
  };

  // Line numbers calculation
  const lineCount = Math.max(1, codeDraft.split('\n').length);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  const eventOptions = [
    { value: 'onClick', label: 'onClick — Mouse Click' },
    { value: 'onEnterFrame', label: 'onEnterFrame — Every Frame / Tick' },
    { value: 'onPointerDown', label: 'onPointerDown — Press' },
    { value: 'onPointerUp', label: 'onPointerUp — Release' },
    { value: 'onPointerEnter', label: 'onPointerEnter — Hover In' },
    { value: 'onPointerLeave', label: 'onPointerLeave — Hover Out' },
  ];

  const snippetCategories: SnippetCategory[] = [
    {
      category: 'Timeline Control',
      items: [
        { title: 'Stop Playback', code: 'this.stop();' },
        { title: 'Play Animation', code: 'this.play();' },
        { title: 'Goto & Stop', code: 'this.gotoAndStop(1);' },
        { title: 'Goto & Play', code: 'this.gotoAndPlay(1);' },
        { title: 'Next Frame', code: 'this.nextFrame();' },
        { title: 'Prev Frame', code: 'this.prevFrame();' },
      ],
    },
    {
      category: 'Position & Motion',
      items: [
        { title: 'Move Right', code: 'this.x += 10;' },
        { title: 'Move Down', code: 'this.y += 10;' },
        { title: 'Rotate 15°', code: 'this.rotation += 15;' },
        { title: 'Scale 110%', code: 'this.scaleX *= 1.1;\nthis.scaleY *= 1.1;' },
        { title: 'Alpha 50%', code: 'this.alpha = 0.5;' },
        { title: 'Toggle Visible', code: 'this.visible = !this.visible;' },
      ],
    },
    {
      category: 'Timers & Events',
      items: [
        { title: 'onEnterFrame Loop', code: 'this.onEnterFrame = () => {\n  this.rotation += 2;\n};' },
        { title: 'Timeout Delay (1s)', code: 'setTimeout(() => {\n  this.play();\n}, 1000);' },
        { title: 'Interval Loop (100ms)', code: 'setInterval(() => {\n  this.x += 1;\n}, 100);' },
      ],
    },
    {
      category: 'Math & Utilities',
      items: [
        { title: 'Oscillate Sine', code: 'this.y = 200 + Math.sin(Date.now() / 250) * 50;' },
        { title: 'Random Position', code: 'this.x = Math.random() * 400;\nthis.y = Math.random() * 300;' },
        { title: 'Console Log Frame', code: 'console.log("Current frame:", this.currentFrame);' },
      ],
    },
  ];

  return (
    <div className={styles.actionsContainer}>
      {/* Categorized Snippet Sidebar */}
      <div className={styles.snippetsSidebar}>
        <div className={styles.snippetsHeader}>
          <span className={styles.snippetsTitle}>Quick Insert</span>
        </div>
        <div className={styles.snippetsList}>
          {snippetCategories.map((group) => (
            <div key={group.category} className={styles.categoryGroup}>
              <div className={styles.categoryLabel}>{group.category}</div>
              {group.items.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={styles.snippetCard}
                  onClick={() => handleQuickInsert(item.code)}
                  title={`Insert: ${item.title}`}
                >
                  <div className={styles.snippetCardTop}>
                    <span className={styles.snippetName}>{item.title}</span>
                    <span className={styles.insertBadge}>+ Insert</span>
                  </div>
                  <code className={styles.snippetCode}>{item.code}</code>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Main Code Editor */}
      <div className={styles.editorArea}>
        <div className={styles.editorToolbar}>
          <div className={styles.targetInfo}>
            <div className={styles.targetBadge}>
              {isEditingObject ? (() => {
                const inst = selectedEl as SymbolInstance;
                const sym = doc.library.symbols[inst.symbolId];
                const targetName = inst.instanceName || sym?.name || inst.id;
                return (
                  <span>
                    Target: ❖ {targetName} (Component Instance)
                  </span>
                );
              })() : (
                <span>
                  🎬 Frame {currentFrame + 1} ({targetLayer?.name || 'Layer 1'})
                </span>
              )}
            </div>

            {isEditingObject && (
              <select
                className={styles.eventSelect}
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
              >
                {eventOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    Event: {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className={styles.toolbarActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleFormat}
              title="Clean up trailing whitespace"
            >
              Format
            </button>
            <button
              type="button"
              className={styles.applyBtn}
              onClick={handleApply}
              title="Compile & bind script (Ctrl+S)"
            >
              Apply Script
            </button>
          </div>
        </div>

        {/* Code editor body with line numbers */}
        <div className={styles.codeEditorContainer}>
          <div className={styles.lineNumbers} ref={lineNumbersRef}>
            {lineNumbers.map((num) => (
              <div key={num} className={styles.lineNumber}>
                {num}
              </div>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            className={styles.codeTextarea}
            value={codeDraft}
            placeholder={
              isEditingObject
                ? `// Scripts for ❖ ${(selectedEl as SymbolInstance).instanceName || 'component'}\n// e.g. this.play(); this.x += 10;`
                : '// Frame script. Runs once when playhead enters this frame.\n// e.g. this.stop();'
            }
            onChange={(e) => setCodeDraft(e.target.value)}
            onScroll={handleScroll}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
          />
        </div>

        {/* Status / feedback footer */}
        <div className={styles.statusBar}>
          <span className={styles.statusContext}>
            Runtime: Native ES Module · Scope: <code>this</code> ={' '}
            {isEditingObject ? 'MovieClipAPI' : 'Root Timeline'}
          </span>
          {statusMsg && (
            <span
              className={`${styles.statusMessage} ${
                statusMsg.isError ? styles.statusError : styles.statusSuccess
              }`}
            >
              {statusMsg.isError ? '✕ ' : '✓ '}
              {statusMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
