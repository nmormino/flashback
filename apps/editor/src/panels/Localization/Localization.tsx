import React, { useState, useRef, useMemo } from 'react';
import {
  Globe,
  Plus,
  Trash2,
  X,
  Code,
  Download,
  Upload,
  Sparkles,
  Search,
  Check,
  Copy,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { TextElement } from '@flashback/runtime';
import { useEditorStore, editorActions, type EditorElement } from '../../state/editorStore';
import styles from './Localization.module.css';

export const Localization: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const previewLocale = useEditorStore((s) => s.previewLocale);
  const localizationPosition = useEditorStore((s) => s.localizationPosition);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);

  const [searchQuery, setSearchQuery] = useState('');
  const [newLocaleCode, setNewLocaleCode] = useState('');
  const [showCmsDrawer, setShowCmsDrawer] = useState(false);
  const [jsonModalMode, setJsonModalMode] = useState<'import' | 'export' | null>(null);
  const [jsonContent, setJsonContent] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Dragging support for floating window
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - (localizationPosition?.x ?? 260),
      y: e.clientY - (localizationPosition?.y ?? 70),
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const nextX = Math.max(10, Math.min(window.innerWidth - 120, moveEvt.clientX - dragOffsetRef.current.x));
      const nextY = Math.max(10, Math.min(window.innerHeight - 80, moveEvt.clientY - dragOffsetRef.current.y));
      editorActions.setLocalizationPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const defaultLocale = doc.i18n?.defaultLocale || 'en';
  const activeLocale = previewLocale || defaultLocale;

  // Collect all locales
  const locales = useMemo(() => {
    const list = Array.from(
      new Set([defaultLocale, ...(doc.i18n ? Object.keys(doc.i18n.locales || {}) : [])])
    );
    return list;
  }, [doc.i18n, defaultLocale]);

  // Map of keys to their bound text element ids
  const boundElementsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const scanElements = (elements: EditorElement[]) => {
      for (const el of elements || []) {
        if (el.type === 'text') {
          const key = (el as TextElement).i18nKey;
          if (key) {
            const arr = map.get(key) || [];
            arr.push(el.id);
            map.set(key, arr);
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

  // Collect all string keys across all locales + elements
  const allKeys = useMemo(() => {
    const set = new Set<string>();
    if (doc.i18n?.locales) {
      for (const locMap of Object.values(doc.i18n.locales)) {
        if (locMap) {
          for (const k of Object.keys(locMap)) set.add(k);
        }
      }
    }
    for (const key of boundElementsMap.keys()) {
      set.add(key);
    }
    return Array.from(set).sort();
  }, [doc.i18n, boundElementsMap]);

  // Filter keys by search
  const filteredKeys = useMemo(() => {
    if (!searchQuery.trim()) return allKeys;
    const q = searchQuery.toLowerCase();
    return allKeys.filter((key) => {
      if (key.toLowerCase().includes(q)) return true;
      for (const loc of locales) {
        const val = doc.i18n?.locales?.[loc]?.[key];
        if (val && val.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [allKeys, searchQuery, locales, doc.i18n]);

  const handleAddLocale = () => {
    const code = newLocaleCode.trim().toLowerCase();
    if (!code) return;
    editorActions.addI18nLocale(code);
    setNewLocaleCode('');
    setFeedbackMsg(`Added locale "${code}"`);
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  const handleRemoveLocale = (loc: string) => {
    if (loc === defaultLocale) return;
    editorActions.removeI18nLocale(loc);
  };

  const handleAddKey = () => {
    let base = 'new_string';
    let counter = 1;
    let candidate = base;
    while (allKeys.includes(candidate)) {
      candidate = `${base}_${counter++}`;
    }
    editorActions.addI18nStringKey(candidate, '');
  };

  const handleAutoExtract = () => {
    const count = editorActions.autoExtractI18nStrings();
    setFeedbackMsg(`Auto-extracted ${count} string keys from canvas text!`);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleBindSelected = (key: string) => {
    if (selectedElementIds.length === 0) return;
    for (const elId of selectedElementIds) {
      editorActions.bindElementToI18nKey(elId, key);
    }
    setFeedbackMsg(`Bound key "${key}" to selected text`);
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  const handleSelectElementOnStage = (elementId: string) => {
    editorActions.selectElement(elementId, false);
  };

  const handleExportJsonClick = () => {
    const payload = {
      defaultLocale: doc.i18n?.defaultLocale || 'en',
      locales: doc.i18n?.locales || { en: {} },
    };
    setJsonContent(JSON.stringify(payload, null, 2));
    setJsonModalMode('export');
  };

  const handleImportJsonSubmit = () => {
    try {
      editorActions.importI18nJson(jsonContent);
      setJsonModalMode(null);
      setFeedbackMsg('Successfully imported translation JSON!');
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (e: any) {
      alert(`Invalid JSON: ${e.message}`);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard?.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div
      className={styles.localizationPanel}
      style={{
        left: `${localizationPosition?.x ?? 260}px`,
        top: `${localizationPosition?.y ?? 70}px`,
      }}
      data-testid="localization-window"
    >
      {/* Header */}
      <div className={styles.panelHeader} onMouseDown={handleHeaderMouseDown}>
        <div className={styles.panelHeaderTitle}>
          <Globe size={14} className={styles.headerIcon} />
          <span>Strings & Localization</span>
          <span className={styles.badgePill}>
            {allKeys.length} {allKeys.length === 1 ? 'key' : 'keys'}
          </span>
          {feedbackMsg && (
            <span style={{ fontSize: 10.5, color: '#34d399', marginLeft: 8 }}>
              {feedbackMsg}
            </span>
          )}
        </div>
        <div className={styles.headerButtons}>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={() => setShowCmsDrawer((v) => !v)}
            title="Show Web Component & CMS Integration Code"
          >
            <Code size={13} />
          </button>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={() => editorActions.setLocalizationOpen(false)}
            title="Close Window (Ctrl+Shift+L)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Locales Selector Bar */}
      <div className={styles.localesBar}>
        <span className={styles.barLabel}>Preview Locale:</span>
        <div className={styles.localePills}>
          {locales.map((loc) => {
            const isActive = activeLocale.toLowerCase() === loc.toLowerCase();
            const isDefault = loc.toLowerCase() === defaultLocale.toLowerCase();
            return (
              <button
                key={loc}
                type="button"
                className={`${styles.localePill} ${isActive ? styles.active : ''}`}
                onClick={() => editorActions.setPreviewLocale(loc)}
                title={`Click to preview ${loc.toUpperCase()} translations on artboard`}
              >
                <span>{loc.toUpperCase()}</span>
                {isDefault && <span className={styles.defaultTag}>Default</span>}
                {!isDefault && (
                  <span
                    className={styles.removeLocaleBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveLocale(loc);
                    }}
                    title={`Remove ${loc.toUpperCase()} locale`}
                  >
                    ×
                  </span>
                )}
              </button>
            );
          })}

          {/* Quick Add Locale */}
          <div className={styles.addLocaleBox}>
            <input
              type="text"
              className={styles.addLocaleInput}
              placeholder="e.g. es-ES"
              value={newLocaleCode}
              onChange={(e) => setNewLocaleCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddLocale();
              }}
            />
            <button
              type="button"
              className={styles.addLocaleBtn}
              onClick={handleAddLocale}
              title="Add a new locale to this project"
            >
              <Plus size={11} />
              <span>Locale</span>
            </button>
          </div>
        </div>
      </div>

      {/* Action & Search Bar */}
      <div className={styles.actionBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <Search size={13} style={{ color: 'var(--mx-text-muted)' }} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search string keys or translations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.actionBtns}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.primary}`}
            onClick={handleAddKey}
            title="Create a new translatable string key"
          >
            <Plus size={12} />
            <span>Add String</span>
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleAutoExtract}
            title="Scan canvas text elements and automatically create keys"
          >
            <Sparkles size={12} />
            <span>Auto-Extract</span>
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => {
              setJsonContent('{}');
              setJsonModalMode('import');
            }}
            title="Import translations JSON from CMS"
          >
            <Upload size={12} />
            <span>Import</span>
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleExportJsonClick}
            title="Export full translation dictionary to JSON"
          >
            <Download size={12} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Main Strings Table */}
      <div className={styles.tableContainer}>
        {filteredKeys.length === 0 ? (
          <div className={styles.emptyState}>
            <Globe size={28} style={{ opacity: 0.3 }} />
            <div className={styles.emptyTitle}>
              {allKeys.length === 0 ? 'No translatable string keys yet' : 'No matching strings found'}
            </div>
            <div className={styles.emptySubtitle}>
              Create keys to support multiple languages or auto-extract all text elements from your artboard in one click.
            </div>
            {allKeys.length === 0 && (
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.primary}`}
                onClick={handleAutoExtract}
              >
                <Sparkles size={12} />
                <span>Auto-Extract Strings from Stage</span>
              </button>
            )}
          </div>
        ) : (
          <table className={styles.stringsTable}>
            <thead>
              <tr>
                <th style={{ width: 170 }}>String Key</th>
                <th style={{ width: 110 }}>Canvas Binding</th>
                {locales.map((loc) => {
                  const isCurrent = activeLocale.toLowerCase() === loc.toLowerCase();
                  return (
                    <th key={loc} style={{ minWidth: 150, color: isCurrent ? 'var(--mx-accent, #3b82f6)' : undefined }}>
                      {loc.toUpperCase()} {loc === defaultLocale ? '(Default)' : ''}
                    </th>
                  );
                })}
                <th style={{ width: 36, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.map((key) => {
                const boundIds = boundElementsMap.get(key) || [];
                const isSelectedOnCanvas = selectedElementIds.some((id) => boundIds.includes(id));

                return (
                  <tr key={key} className={`${styles.row} ${isSelectedOnCanvas ? styles.selected : ''}`}>
                    {/* Key Name Cell */}
                    <td>
                      <div className={styles.keyCell}>
                        <button
                          type="button"
                          className={styles.headerBtn}
                          style={{ width: 18, height: 18 }}
                          onClick={() => handleCopyKey(key)}
                          title="Copy key identifier"
                        >
                          {copiedKey === key ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        </button>
                        <input
                          type="text"
                          className={styles.keyName}
                          defaultValue={key}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val && val !== key) {
                              editorActions.renameI18nStringKey(key, val);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                      </div>
                    </td>

                    {/* Stage Element Binding */}
                    <td>
                      {boundIds.length > 0 ? (
                        <button
                          type="button"
                          className={styles.elementBadge}
                          onClick={() => handleSelectElementOnStage(boundIds[0])}
                          title={`Bound to ${boundIds.length} element(s). Click to select on stage.`}
                        >
                          <Layers size={10} />
                          <span>{boundIds.length} text</span>
                        </button>
                      ) : selectedElementIds.length > 0 ? (
                        <button
                          type="button"
                          className={styles.elementBadge}
                          style={{ color: 'var(--mx-accent, #3b82f6)' }}
                          onClick={() => handleBindSelected(key)}
                          title="Bind selected text element to this key"
                        >
                          + Bind Selected
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--mx-text-muted)' }}>Unbound</span>
                      )}
                    </td>

                    {/* Locale Translation Inputs */}
                    {locales.map((loc) => {
                      const isCurrent = activeLocale.toLowerCase() === loc.toLowerCase();
                      const currentVal = doc.i18n?.locales?.[loc]?.[key] ?? '';

                      return (
                        <td key={loc}>
                          <input
                            type="text"
                            className={`${styles.translationInput} ${isCurrent ? styles.activeLocaleInput : ''}`}
                            value={currentVal}
                            placeholder={loc === defaultLocale ? 'Default text...' : `${loc.toUpperCase()} translation...`}
                            onChange={(e) => {
                              editorActions.setI18nTranslation(loc, key, e.target.value);
                            }}
                          />
                        </td>
                      );
                    })}

                    {/* Delete Action */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => editorActions.removeI18nKey(key)}
                        title={`Delete key "${key}"`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* CMS & Web Component Code Snippet Drawer */}
      {showCmsDrawer && (
        <div className={styles.cmsCodeDrawer}>
          <div style={{ fontWeight: 600, color: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
            <span>⚡ Web Component & CMS Translation API:</span>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => setShowCmsDrawer(false)}
              style={{ width: 16, height: 16 }}
            >
              <X size={11} />
            </button>
          </div>
          <div className={styles.codeBlock}>
{`<!-- 1. Pass locale attribute directly -->
<web-anim id="my-banner" locale="${activeLocale}" src="banner.json"></web-anim>

<!-- 2. Pass translations via prop or attribute -->
<web-anim locale="es-ES" strings='{"headline": "Gran Oferta", "cta": "Comprar"}'></web-anim>

<!-- 3. Dynamic Third-Party CMS JSON swapping in JavaScript -->
<script>
  const anim = document.querySelector('#my-banner');

  // Extract all current strings:
  const currentStrings = anim.getTextStrings(); // { [key]: "value" }

  // Swap out strings dynamically from CMS:
  anim.setTextStrings({
    ${filteredKeys.slice(0, 2).map((k) => `"${k}": "New CMS Value"`).join(',\n    ') || '"headline": "CMS Text"'}
  });
</script>`}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className={styles.footerBar}>
        <span>
          Editing values updates stage text in real time • Active preview:{' '}
          <strong style={{ color: 'var(--mx-accent, #3b82f6)' }}>{activeLocale.toUpperCase()}</strong>
        </span>
        <button
          type="button"
          style={{ background: 'none', border: 'none', color: 'var(--mx-accent, #3b82f6)', cursor: 'pointer', fontSize: 11 }}
          onClick={() => setShowCmsDrawer((v) => !v)}
        >
          {showCmsDrawer ? 'Hide Code' : 'CMS Code Snippet'}
        </button>
      </div>

      {/* JSON Import/Export Modal */}
      {jsonModalMode && (
        <div className={styles.jsonModalOverlay} onClick={() => setJsonModalMode(null)}>
          <div className={styles.jsonModalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: 12 }}>
                {jsonModalMode === 'export' ? 'Export Translation Dictionary' : 'Import Translations JSON'}
              </span>
              <button
                type="button"
                className={styles.headerBtn}
                onClick={() => setJsonModalMode(null)}
              >
                <X size={13} />
              </button>
            </div>
            <textarea
              className={styles.jsonTextarea}
              value={jsonContent}
              onChange={(e) => setJsonContent(e.target.value)}
              readOnly={jsonModalMode === 'export'}
              placeholder="Paste CMS JSON dictionary here..."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              {jsonModalMode === 'export' ? (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.primary}`}
                  onClick={() => {
                    navigator.clipboard?.writeText(jsonContent);
                    setFeedbackMsg('Copied JSON to clipboard!');
                    setJsonModalMode(null);
                    setTimeout(() => setFeedbackMsg(null), 2500);
                  }}
                >
                  <Copy size={11} />
                  <span>Copy JSON</span>
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.primary}`}
                  onClick={handleImportJsonSubmit}
                >
                  <Upload size={11} />
                  <span>Import & Merge</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
