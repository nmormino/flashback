import React, { useState, useRef, useMemo } from 'react';
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  X,
  Search,
  Code,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { StateVariable, StateVariableType, TextElement } from '@flashback/runtime';
import { useEditorStore, editorActions, type EditorElement } from '../../state/editorStore';
import styles from './StateVariables.module.css';

export const StateVariables: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const stateVariablesPosition = useEditorStore((s) => s.stateVariablesPosition);

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<StateVariableType>('number');
  const [newDefaultVal, setNewDefaultVal] = useState<string>('0');
  const [newIsPublic, setNewIsPublic] = useState(true);
  const [showCodeDrawer, setShowCodeDrawer] = useState(false);

  // Dragging support for floating window
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - (stateVariablesPosition?.x ?? 220),
      y: e.clientY - (stateVariablesPosition?.y ?? 80),
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const nextX = Math.max(10, Math.min(window.innerWidth - 120, moveEvt.clientX - dragOffsetRef.current.x));
      const nextY = Math.max(10, Math.min(window.innerHeight - 80, moveEvt.clientY - dragOffsetRef.current.y));
      editorActions.setStateVariablesPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const variables = doc.stateVariables || [];

  // Count text elements bound to each variable
  const boundCountMap = useMemo(() => {
    const map = new Map<string, number>();
    const scanElements = (elements: EditorElement[]) => {
      for (const el of elements || []) {
        if (el.type === 'text') {
          const txt = el as TextElement;
          const varKey = txt.stateBinding || txt.variable;
          if (varKey) {
            map.set(varKey, (map.get(varKey) || 0) + 1);
          }
          // Also detect {token} in template text
          if (txt.text && txt.text.includes('{')) {
            const matches = txt.text.match(/\{([a-zA-Z0-9_$]+)\}/g);
            if (matches) {
              for (const m of matches) {
                const k = m.slice(1, -1);
                map.set(k, (map.get(k) || 0) + 1);
              }
            }
          }
        }
      }
    };

    for (const l of doc.root?.layers || []) {
      for (const kf of l.keyframes || []) scanElements(kf.elements);
    }
    for (const sym of Object.values(doc.library?.symbols || {})) {
      for (const l of sym.timeline?.layers || []) {
        for (const kf of l.keyframes || []) scanElements(kf.elements);
      }
    }
    return map;
  }, [doc]);

  const filteredVars = useMemo(() => {
    if (!searchQuery.trim()) return variables;
    const q = searchQuery.toLowerCase();
    return variables.filter((v) => v.name.toLowerCase().includes(q));
  }, [variables, searchQuery]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    let parsedVal: any = newDefaultVal;
    if (newType === 'number') parsedVal = Number(newDefaultVal) || 0;
    else if (newType === 'boolean') parsedVal = newDefaultVal === 'true';
    else if (newType === 'json') {
      try {
        parsedVal = JSON.parse(newDefaultVal);
      } catch {
        parsedVal = {};
      }
    }

    editorActions.addStateVariable({
      name: newName,
      type: newType,
      defaultValue: parsedVal,
      isPublic: newIsPublic,
    });

    setNewName('');
    setNewDefaultVal(newType === 'number' ? '0' : newType === 'boolean' ? 'false' : '');
    setShowAddForm(false);
  };

  const handleTypeChange = (t: StateVariableType) => {
    setNewType(t);
    if (t === 'number') setNewDefaultVal('0');
    else if (t === 'boolean') setNewDefaultVal('false');
    else if (t === 'string') setNewDefaultVal('');
    else if (t === 'json') setNewDefaultVal('{}');
  };

  return (
    <div
      className={styles.statePanel}
      style={{
        left: `${stateVariablesPosition?.x ?? 220}px`,
        top: `${stateVariablesPosition?.y ?? 80}px`,
      }}
      data-testid="floating-state-variables-panel"
    >
      {/* Draggable Header */}
      <div className={styles.panelHeader} onMouseDown={handleHeaderMouseDown}>
        <div className={styles.panelHeaderTitle} title="State & Variables — Drag to move window">
          <SlidersHorizontal size={13} className={styles.headerIcon} />
          <span>State & Variables — {doc.meta.name || 'Untitled'}</span>
        </div>
        <button
          type="button"
          className={styles.closeWindowBtn}
          onClick={() => editorActions.setStateVariablesOpen(false)}
          title="Close State Variables Window"
          data-testid="close-state-variables-btn"
        >
          <X size={13} />
        </button>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={12} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search state variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setShowAddForm(!showAddForm)}
          data-testid="toggle-add-variable-btn"
        >
          <Plus size={12} />
          <span>{showAddForm ? 'Cancel' : 'New Variable'}</span>
        </button>
      </div>

      {/* Quick Add Variable Form */}
      {showAddForm && (
        <form className={styles.addForm} onSubmit={handleAddSubmit}>
          <div className={styles.formRow}>
            <input
              type="text"
              className={styles.inputField}
              placeholder="Variable name (e.g. score)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              required
            />
            <select
              className={styles.typeSelect}
              value={newType}
              onChange={(e) => handleTypeChange(e.target.value as StateVariableType)}
            >
              <option value="number"># Number</option>
              <option value="string">T String</option>
              <option value="boolean">✓ Boolean</option>
              <option value="json">{} JSON</option>
            </select>
          </div>
          <div className={styles.formRow}>
            <input
              type="text"
              className={styles.inputField}
              placeholder="Default value"
              value={newDefaultVal}
              onChange={(e) => setNewDefaultVal(e.target.value)}
            />
            <label className={styles.checkboxLabel} title="Allow external prop override via <web-anim state={{ ... }} />">
              <input
                type="checkbox"
                checked={newIsPublic}
                onChange={(e) => setNewIsPublic(e.target.checked)}
              />
              <span>Public</span>
            </label>
            <button type="submit" className={styles.addBtn} data-testid="save-new-variable-btn">
              Add
            </button>
          </div>
        </form>
      )}

      {/* Variable Cards List */}
      <div className={styles.variableList}>
        {filteredVars.length === 0 ? (
          <div className={styles.emptyState}>
            No state variables defined yet.
            <br />
            Click <strong>+ New Variable</strong> above to create shared state (e.g. <code>score</code>, <code>lives</code>) accessible in State Machine transitions, listeners, and bindable to text blocks.
          </div>
        ) : (
          filteredVars.map((v) => {
            const boundCount = boundCountMap.get(v.name) || 0;
            const currentVal = doc.state?.[v.name] ?? v.defaultValue;

            let typeClass = styles.typeNumber;
            if (v.type === 'string') typeClass = styles.typeString;
            else if (v.type === 'boolean') typeClass = styles.typeBoolean;
            else if (v.type === 'json') typeClass = styles.typeJson;

            return (
              <div key={v.id} className={styles.varCard} data-testid={`var-card-${v.name}`}>
                <div className={styles.varLeft}>
                  <span className={`${styles.varTypeBadge} ${typeClass}`}>{v.type}</span>
                  <span className={styles.varName}>{v.name}</span>
                  <button
                    type="button"
                    className={v.isPublic ? styles.publicPill : styles.privatePill}
                    onClick={() => editorActions.updateStateVariable(v.id, { isPublic: !v.isPublic })}
                    title={
                      v.isPublic
                        ? 'Public: Can be passed into <web-anim state={{...}} /> (Click to make private)'
                        : 'Private: Internal only (Click to make public)'
                    }
                  >
                    {v.isPublic ? 'Public' : 'Private'}
                  </button>
                  {boundCount > 0 && (
                    <span className={styles.boundCountBadge} title={`${boundCount} text elements bound on stage`}>
                      <Layers size={9} style={{ display: 'inline', marginRight: 2 }} />
                      {boundCount}
                    </span>
                  )}
                </div>

                <div className={styles.varRight}>
                  <input
                    type="text"
                    className={styles.varValInput}
                    value={typeof currentVal === 'object' ? JSON.stringify(currentVal) : String(currentVal ?? '')}
                    onChange={(e) => {
                      let val: any = e.target.value;
                      if (v.type === 'number') val = Number(e.target.value) || 0;
                      else if (v.type === 'boolean') val = e.target.value === 'true';
                      editorActions.updateStateVariable(v.id, { defaultValue: val });
                    }}
                    title="Default / current value"
                  />
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => editorActions.deleteStateVariable(v.id)}
                    title={`Delete variable "${v.name}"`}
                    data-testid={`delete-var-${v.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Code Snippet Drawer */}
      <div className={styles.footerAccordion}>
        <button
          type="button"
          className={styles.accordionToggle}
          onClick={() => setShowCodeDrawer(!showCodeDrawer)}
          data-testid="toggle-code-snippets-btn"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Code size={11} />
            Web Component & State Machine API
          </span>
          {showCodeDrawer ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showCodeDrawer && (
          <div className={styles.codeSnippetBox}>
            <div>{`// Pass public state into <web-anim>`}</div>
            <div>{`<web-anim state={{ ${variables.map((v) => `${v.name}: ${v.defaultValue}`).slice(0, 3).join(', ') || 'score: 1000'} }} />`}</div>
            <br />
            <div>{`// In State Machine Transitions & Listeners:`}</div>
            <div>{`// Inputs and variables drive transition conditions (e.g. score >= 100)`}</div>
            <div>{`// Listeners trigger state transitions and input mutations`}</div>
            <br />
            <div>{`// Web Component API:`}</div>
            <div>{`const el = document.querySelector('web-anim');`}</div>
            <div>{`el.setInputValue('score', 100);`}</div>
            <div>{`const score = el.getInputValue('score');`}</div>
          </div>
        )}
      </div>
    </div>
  );
};
