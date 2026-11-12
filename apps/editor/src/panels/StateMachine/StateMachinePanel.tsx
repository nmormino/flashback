import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  X,
  Play,
  Layers,
  ArrowRight,
  Sliders,
  CheckSquare,
  Hash,
  Link,
  ChevronRight,
  Settings,
  Activity,
  Move,
} from 'lucide-react';
import type {
  StateMachineDef,
  StateMachineInput,
  StateNode,
  StateNodeType,
  StateTransition,
  StateCondition,
  ConditionOperator,
  StateListener,
  StateListenerAction,
  StateListenerEventType,
  StateListenerActionType,
} from '@flashback/runtime';
import { useEditorStore, editorActions } from '../../state/editorStore';
import styles from './StateMachinePanel.module.css';

type SelectedItem =
  | { type: 'node'; id: string }
  | { type: 'transition'; id: string }
  | null;

export const StateMachinePanel: React.FC = () => {
  const doc = useEditorStore((s) => s.doc);
  const activeSmId = doc.activeStateMachineId;

  // Find active state machine or fall back to first
  const stateMachines = doc.stateMachines || [];
  const activeSm = useMemo(() => {
    if (!stateMachines.length) return null;
    return stateMachines.find((sm) => sm.id === activeSmId) || stateMachines[0];
  }, [stateMachines, activeSmId]);

  // Keep activeSmId synced in doc if null but state machines exist
  useEffect(() => {
    if (stateMachines.length > 0 && !activeSmId) {
      editorActions.setActiveStateMachine(stateMachines[0].id);
    }
  }, [stateMachines, activeSmId]);

  // Selection state
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);

  // Transition connection mode state
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);

  // Quick transition connector state
  const [quickConnectFrom, setQuickConnectFrom] = useState('');
  const [quickConnectTo, setQuickConnectTo] = useState('');

  // Node dragging state
  const [draggingNode, setDraggingNode] = useState<{
    id: string;
    startX: number;
    startY: number;
    initialNodeX: number;
    initialNodeY: number;
    hasMoved: boolean;
  } | null>(null);

  const [dragOffset, setDragOffset] = useState<{ id: string; x: number; y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // Available library symbol names / IDs for clip selection
  const availableClips = useMemo(() => {
    const symbols = doc.library?.symbols || {};
    return Object.keys(symbols).map((id) => ({
      id,
      name: symbols[id].name || id,
    }));
  }, [doc.library?.symbols]);

  // Helper to get effective position of a node (including active drag offset)
  const getNodePos = (node: StateNode) => {
    if (dragOffset && dragOffset.id === node.id) {
      return { x: dragOffset.x, y: dragOffset.y };
    }
    return { x: node.x ?? 150, y: node.y ?? 120 };
  };

  // Node dimensions
  const getNodeDimensions = (type: StateNodeType) => {
    if (type === 'entry') return { width: 110, height: 38 };
    return { width: 140, height: 60 };
  };

  // Node Center calculation for transition endpoints
  const getNodeCenter = (node: StateNode) => {
    const pos = getNodePos(node);
    const dims = getNodeDimensions(node.type);
    return {
      cx: pos.x + dims.width / 2,
      cy: pos.y + dims.height / 2,
    };
  };

  // Dragging event handlers on SVG
  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (!draggingNode || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const dx = currentX - draggingNode.startX;
    const dy = currentY - draggingNode.startY;

    if (Math.hypot(dx, dy) > 3) {
      const nextX = Math.round(Math.max(10, draggingNode.initialNodeX + dx));
      const nextY = Math.round(Math.max(10, draggingNode.initialNodeY + dy));
      setDragOffset({ id: draggingNode.id, x: nextX, y: nextY });
      if (!draggingNode.hasMoved) {
        setDraggingNode({ ...draggingNode, hasMoved: true });
      }
    }
  };

  const handleSvgMouseUp = () => {
    if (draggingNode && activeSm) {
      if (draggingNode.hasMoved && dragOffset && dragOffset.id === draggingNode.id) {
        editorActions.updateStateNode(activeSm.id, draggingNode.id, {
          x: dragOffset.x,
          y: dragOffset.y,
        });
      }
    }
    setDraggingNode(null);
    setDragOffset(null);
  };

  // If no state machine exists, render initial setup screen
  if (!activeSm) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Zap size={48} color="#3b82f6" />
          <div className={styles.emptyTitle}>No State Machine Defined</div>
          <div className={styles.emptyDesc}>
            State machines allow you to build declarative interactive logic, animations,
            clip transitions, and game listeners without code.
          </div>
          <button
            type="button"
            className={styles.createSmBtn}
            onClick={() => {
              const sm = editorActions.addStateMachine('Main State Machine');
              editorActions.setActiveStateMachine(sm.id);
            }}
          >
            <Plus size={16} />
            Create State Machine
          </button>
        </div>
      </div>
    );
  }

  // Selected State Node
  const selectedNode =
    selectedItem?.type === 'node'
      ? activeSm.states.find((s) => s.id === selectedItem.id) || null
      : null;

  // Selected Transition
  const selectedTransition =
    selectedItem?.type === 'transition'
      ? activeSm.transitions.find((t) => t.id === selectedItem.id) || null
      : null;

  // Handlers for inputs
  const handleAddInput = (type: 'boolean' | 'number' | 'trigger') => {
    const count = (activeSm.inputs || []).length + 1;
    const defaultVal = type === 'boolean' ? false : type === 'number' ? 0 : false;
    editorActions.addStateMachineInput(activeSm.id, {
      name: `${type}_${count}`,
      type,
      value: defaultVal,
    });
  };

  // Handlers for state nodes
  const handleAddState = (type: StateNodeType = 'clip') => {
    const count = activeSm.states.filter((s) => s.type === type).length + 1;
    const name = type === 'clip' ? `Clip State ${count}` : `Blend State ${count}`;
    const x = 120 + ((activeSm.states.length * 60) % 400);
    const y = 80 + ((activeSm.states.length * 40) % 250);
    editorActions.addStateNode(activeSm.id, {
      name,
      type,
      x,
      y,
      clipName: availableClips[0]?.name || 'idle',
    });
  };

  // Handler for connecting transition via clicking nodes
  const handleNodeClick = (node: StateNode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConnecting) {
      if (!connectFromId) {
        setConnectFromId(node.id);
      } else {
        if (connectFromId !== node.id || confirm('Create self-transition loop?')) {
          editorActions.addStateTransition(activeSm.id, {
            fromStateId: connectFromId,
            toStateId: node.id,
            durationMs: 150,
            conditions: [],
          });
        }
        setIsConnecting(false);
        setConnectFromId(null);
      }
    } else {
      setSelectedItem({ type: 'node', id: node.id });
    }
  };

  // Quick connect button
  const handleQuickConnect = () => {
    if (!quickConnectFrom || !quickConnectTo) return;
    editorActions.addStateTransition(activeSm.id, {
      fromStateId: quickConnectFrom,
      toStateId: quickConnectTo,
      durationMs: 150,
      conditions: [],
    });
    setQuickConnectFrom('');
    setQuickConnectTo('');
  };

  // Delete selected item
  const handleDeleteSelected = () => {
    if (!selectedItem) return;
    if (selectedItem.type === 'node') {
      editorActions.deleteStateNode(activeSm.id, selectedItem.id);
    } else if (selectedItem.type === 'transition') {
      editorActions.deleteStateTransition(activeSm.id, selectedItem.id);
    }
    setSelectedItem(null);
  };

  return (
    <div className={styles.container}>
      {/* 1. Header Toolbar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Zap size={16} color="#3b82f6" />
          <select
            className={styles.smSelect}
            value={activeSm.id}
            onChange={(e) => editorActions.setActiveStateMachine(e.target.value)}
          >
            {stateMachines.map((sm) => (
              <option key={sm.id} value={sm.id}>
                {sm.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => {
              const newSm = editorActions.addStateMachine(
                `State Machine ${stateMachines.length + 1}`
              );
              editorActions.setActiveStateMachine(newSm.id);
            }}
          >
            <Plus size={12} /> New SM
          </button>
        </div>

        <div className={styles.topBarRight}>
          <div className={styles.statBadge}>
            <Sliders size={12} /> {activeSm.inputs?.length || 0} Inputs
          </div>
          <div className={styles.statBadge}>
            <Layers size={12} /> {activeSm.states.length} States
          </div>
          <div className={styles.statBadge}>
            <ArrowRight size={12} /> {activeSm.transitions.length} Transitions
          </div>
        </div>
      </div>

      {/* 2. Three Columns Main Area */}
      <div className={styles.threeColumns}>
        {/* ================= LEFT COLUMN: Inputs List ================= */}
        <div className={styles.leftCol}>
          <div className={styles.colHeader}>
            <span>Inputs</span>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.addBtn}
                title="Add Boolean Input"
                onClick={() => handleAddInput('boolean')}
              >
                + Bool
              </button>
              <button
                type="button"
                className={styles.addBtn}
                title="Add Number Input"
                onClick={() => handleAddInput('number')}
              >
                + Num
              </button>
              <button
                type="button"
                className={styles.addBtn}
                title="Add Trigger Input"
                onClick={() => handleAddInput('trigger')}
              >
                + Trig
              </button>
            </div>
          </div>

          <div className={styles.inputsList}>
            {!activeSm.inputs || activeSm.inputs.length === 0 ? (
              <div style={{ padding: '16px', color: '#71717a', textAlign: 'center' }}>
                No inputs defined.
                <br />
                Add Boolean, Number, or Trigger to drive transitions.
              </div>
            ) : (
              activeSm.inputs.map((inp) => (
                <div key={inp.id} className={styles.inputCard}>
                  <div className={styles.inputCardHeader}>
                    <span
                      className={`${styles.typeBadge} ${
                        inp.type === 'boolean'
                          ? styles.typeBadgeBoolean
                          : inp.type === 'number'
                          ? styles.typeBadgeNumber
                          : styles.typeBadgeTrigger
                      }`}
                    >
                      {inp.type}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#f4f4f5' }}>
                      {inp.name}
                    </span>
                    <input
                      type="text"
                      className={styles.inputNameField}
                      value={inp.name}
                      data-testid={`input-field-${inp.name}`}
                      onChange={(e) =>
                        editorActions.updateStateMachineInput(activeSm.id, inp.id, {
                          name: e.target.value,
                        })
                      }
                      title="Input Name"
                    />
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="Delete Input"
                      onClick={() =>
                        editorActions.deleteStateMachineInput(activeSm.id, inp.id)
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div className={styles.inputControlsRow}>
                    {inp.type === 'boolean' && (
                      <label className={styles.boolToggle}>
                        <input
                          type="checkbox"
                          className={styles.boolCheckbox}
                          checked={Boolean(inp.value)}
                          onChange={(e) =>
                            editorActions.updateStateMachineInput(activeSm.id, inp.id, {
                              value: e.target.checked,
                            })
                          }
                        />
                        <span>{Boolean(inp.value) ? 'true' : 'false'}</span>
                      </label>
                    )}

                    {inp.type === 'number' && (
                      <div className={styles.numberControls}>
                        <button
                          type="button"
                          className={styles.stepBtn}
                          onClick={() =>
                            editorActions.updateStateMachineInput(activeSm.id, inp.id, {
                              value: Number(inp.value || 0) - 1,
                            })
                          }
                        >
                          -
                        </button>
                        <input
                          type="number"
                          className={styles.numberInput}
                          value={inp.value as number}
                          onChange={(e) =>
                            editorActions.updateStateMachineInput(activeSm.id, inp.id, {
                              value: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                        <button
                          type="button"
                          className={styles.stepBtn}
                          onClick={() =>
                            editorActions.updateStateMachineInput(activeSm.id, inp.id, {
                              value: Number(inp.value || 0) + 1,
                            })
                          }
                        >
                          +
                        </button>
                      </div>
                    )}

                    {inp.type === 'trigger' && (
                      <button
                        type="button"
                        className={`${styles.fireBtn} ${
                          Boolean(inp.value) ? styles.fireBtnActive : ''
                        }`}
                        onClick={() => {
                          editorActions.updateStateMachineInput(activeSm.id, inp.id, {
                            value: true,
                          });
                          setTimeout(() => {
                            editorActions.updateStateMachineInput(activeSm.id, inp.id, {
                              value: false,
                            });
                          }, 250);
                        }}
                      >
                        <Zap size={11} /> Fire
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ================= CENTER COLUMN: Visual State Graph ================= */}
        <div className={styles.centerCol}>
          {/* Graph Toolbar */}
          <div className={styles.graphToolbar}>
            <div className={styles.toolbarGroup}>
              <button
                type="button"
                className={styles.toolbarBtn}
                onClick={() => handleAddState('clip')}
              >
                <Plus size={12} /> Add Clip State
              </button>
              <button
                type="button"
                className={styles.toolbarBtn}
                onClick={() => handleAddState('blend1d')}
              >
                <Plus size={12} /> Add Blend State
              </button>
              <button
                type="button"
                className={`${styles.toolbarBtn} ${
                  isConnecting ? styles.toolbarBtnActive : ''
                }`}
                onClick={() => {
                  setIsConnecting(!isConnecting);
                  setConnectFromId(null);
                }}
              >
                <Link size={12} />
                {isConnecting
                  ? connectFromId
                    ? 'Click Target Node'
                    : 'Click Source Node'
                  : 'Connect Transition'}
              </button>
            </div>

            <div className={styles.toolbarGroup}>
              <button
                type="button"
                className={styles.toolbarBtn}
                disabled={!selectedItem}
                onClick={handleDeleteSelected}
                title="Delete Selected Node or Transition"
              >
                <Trash2 size={12} /> Delete Selected
              </button>
            </div>
          </div>

          {/* Quick Connect Helper if isConnecting or quick connect bar */}
          {isConnecting && (
            <div className={styles.connectHelperBar}>
              <span>
                🔗 Connecting Transition:{' '}
                {connectFromId
                  ? `Source selected (${
                      activeSm.states.find((s) => s.id === connectFromId)?.name
                    }). Now click destination state.`
                  : 'Click on the origin state node in the graph.'}
              </span>
              <button
                type="button"
                className={styles.toolbarBtn}
                style={{ padding: '2px 6px', height: '20px' }}
                onClick={() => {
                  setIsConnecting(false);
                  setConnectFromId(null);
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Graph Canvas SVG */}
          <div
            className={styles.graphCanvas}
            onClick={() => {
              if (!isConnecting) {
                setSelectedItem(null);
              }
            }}
          >
            <svg
              ref={svgRef}
              className={styles.graphSvg}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
            >
              <defs>
                <pattern
                  id="stateGraphGrid"
                  width="20"
                  height="20"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="2" cy="2" r="1" fill="#232328" />
                </pattern>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#71717a" />
                </marker>
                <marker
                  id="arrow-selected"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
                </marker>
              </defs>

              {/* Background Grid */}
              <rect width="100%" height="100%" fill="url(#stateGraphGrid)" />

              {/* 1. Transitions Layer */}
              {activeSm.transitions.map((tr) => {
                const fromNode = activeSm.states.find((s) => s.id === tr.fromStateId);
                const toNode = activeSm.states.find((s) => s.id === tr.toStateId);
                if (!fromNode || !toNode) return null;

                const fromPt = getNodeCenter(fromNode);
                const toPt = getNodeCenter(toNode);
                const isSelected =
                  selectedItem?.type === 'transition' && selectedItem.id === tr.id;

                const isSelf = tr.fromStateId === tr.toStateId;
                let pathD = '';
                let midX = (fromPt.cx + toPt.cx) / 2;
                let midY = (fromPt.cy + toPt.cy) / 2;

                if (isSelf) {
                  pathD = `M ${fromPt.cx - 20} ${fromPt.cy - 25} C ${fromPt.cx - 40} ${
                    fromPt.cy - 65
                  }, ${fromPt.cx + 40} ${fromPt.cy - 65}, ${fromPt.cx + 20} ${
                    fromPt.cy - 25
                  }`;
                  midX = fromPt.cx;
                  midY = fromPt.cy - 55;
                } else {
                  const dx = toPt.cx - fromPt.cx;
                  const dy = toPt.cy - fromPt.cy;
                  const curvature = Math.min(60, Math.hypot(dx, dy) * 0.15);
                  // Perpendicular offset for curved double arrows
                  const nx = -dy / (Math.hypot(dx, dy) || 1);
                  const ny = dx / (Math.hypot(dx, dy) || 1);
                  const ctrlX = midX + nx * curvature;
                  const ctrlY = midY + ny * curvature;

                  pathD = `M ${fromPt.cx} ${fromPt.cy} Q ${ctrlX} ${ctrlY} ${toPt.cx} ${toPt.cy}`;
                  midX = (fromPt.cx + 2 * ctrlX + toPt.cx) / 4;
                  midY = (fromPt.cy + 2 * ctrlY + toPt.cy) / 4;
                }

                // Condition badge text
                let badgeText = '';
                if (tr.conditions && tr.conditions.length > 0) {
                  badgeText = tr.conditions
                    .map((c) => {
                      const inp = activeSm.inputs?.find((i) => i.id === c.inputId);
                      return `${inp?.name || c.inputId} ${c.op} ${c.value}`;
                    })
                    .join(' & ');
                } else if (tr.durationMs && tr.durationMs > 0) {
                  badgeText = `${tr.durationMs}ms`;
                } else {
                  badgeText = 'instant';
                }

                return (
                  <g
                    key={tr.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedItem({ type: 'transition', id: tr.id });
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Invisible thicker hit-area */}
                    <path
                      d={pathD}
                      stroke="transparent"
                      strokeWidth={16}
                      fill="none"
                    />

                    {/* Visible line */}
                    <path
                      d={pathD}
                      stroke={isSelected ? '#38bdf8' : '#71717a'}
                      strokeWidth={isSelected ? 3 : 2}
                      fill="none"
                      markerEnd={isSelected ? 'url(#arrow-selected)' : 'url(#arrow)'}
                    />

                    {/* Condition badge */}
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x={-(badgeText.length * 3.5 + 8)}
                        y={-9}
                        width={badgeText.length * 7 + 16}
                        height={18}
                        rx={9}
                        fill={isSelected ? '#0369a1' : '#18181b'}
                        stroke={isSelected ? '#38bdf8' : '#3f3f46'}
                        strokeWidth={1}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={isSelected ? '#ffffff' : '#93c5fd'}
                        fontSize={10}
                        fontWeight={500}
                        style={{ pointerEvents: 'none' }}
                      >
                        {badgeText}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* 2. State Nodes Layer */}
              {activeSm.states.map((node) => {
                const pos = getNodePos(node);
                const dims = getNodeDimensions(node.type);
                const isSelected =
                  selectedItem?.type === 'node' && selectedItem.id === node.id;
                const isConnectSource = connectFromId === node.id;

                if (node.type === 'entry') {
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      style={{ cursor: isConnecting ? 'pointer' : 'move' }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (!isConnecting) {
                          setDraggingNode({
                            id: node.id,
                            startX: e.clientX,
                            startY: e.clientY,
                            initialNodeX: pos.x,
                            initialNodeY: pos.y,
                            hasMoved: false,
                          });
                        }
                      }}
                      onClick={(e) => handleNodeClick(node, e)}
                    >
                      <rect
                        width={dims.width}
                        height={dims.height}
                        rx={19}
                        ry={19}
                        fill={isConnectSource ? '#166534' : '#14532d'}
                        stroke={
                          isSelected
                            ? '#38bdf8'
                            : isConnectSource
                            ? '#4ade80'
                            : '#22c55e'
                        }
                        strokeWidth={isSelected || isConnectSource ? 2.5 : 1.5}
                      />
                      <text
                        x={dims.width / 2}
                        y={dims.height / 2 + 1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#ffffff"
                        fontSize={12}
                        fontWeight={700}
                        letterSpacing={0.5}
                        style={{ pointerEvents: 'none' }}
                      >
                        ▶ Entry
                      </text>
                    </g>
                  );
                }

                // Regular Clip or Blend State Node Card
                const headerColor =
                  node.type === 'blend1d' || node.type === 'blend2d'
                    ? '#7c2d12'
                    : node.type === 'exit'
                    ? '#7f1d1d'
                    : '#312e81';

                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    style={{ cursor: isConnecting ? 'pointer' : 'move' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (!isConnecting) {
                        setDraggingNode({
                          id: node.id,
                          startX: e.clientX,
                          startY: e.clientY,
                          initialNodeX: pos.x,
                          initialNodeY: pos.y,
                          hasMoved: false,
                        });
                      }
                    }}
                    onClick={(e) => handleNodeClick(node, e)}
                  >
                    {/* Card background */}
                    <rect
                      width={dims.width}
                      height={dims.height}
                      rx={8}
                      ry={8}
                      fill="#1f1f23"
                      stroke={
                        isSelected
                          ? '#38bdf8'
                          : isConnectSource
                          ? '#4ade80'
                          : '#333339'
                      }
                      strokeWidth={isSelected || isConnectSource ? 2.5 : 1.5}
                    />

                    {/* Card header strip */}
                    <path
                      d={`M 0 8 Q 0 0 8 0 L ${dims.width - 8} 0 Q ${
                        dims.width
                      } 0 ${dims.width} 8 L ${dims.width} 22 L 0 22 Z`}
                      fill={headerColor}
                    />

                    {/* Node Type badge in header */}
                    <text
                      x={8}
                      y={12}
                      dominantBaseline="central"
                      fill="#e0e7ff"
                      fontSize={9}
                      fontWeight={700}
                      letterSpacing={0.5}
                      style={{ pointerEvents: 'none' }}
                    >
                      {node.type.toUpperCase()}
                    </text>

                    {/* State Name */}
                    <text
                      x={8}
                      y={34}
                      fill="#f4f4f5"
                      fontSize={11}
                      fontWeight={600}
                      style={{ pointerEvents: 'none' }}
                    >
                      {node.name.length > 18
                        ? node.name.slice(0, 16) + '…'
                        : node.name}
                    </text>

                    {/* Clip label / speed info */}
                    <text
                      x={8}
                      y={48}
                      fill="#a1a1aa"
                      fontSize={9}
                      style={{ pointerEvents: 'none' }}
                    >
                      🎬 {node.clipName || 'none'}
                      {node.loop ? ' ⟳' : ''}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: Inspector & Listeners ================= */}
        <div className={styles.rightCol}>
          {/* Section 1: Selected Element Inspector */}
          <div className={styles.inspectorSection}>
            <div className={styles.sectionHeader}>
              <span>Selection Inspector</span>
              {selectedItem && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => setSelectedItem(null)}
                  title="Deselect"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {selectedNode && (
              <>
                <div className={styles.propRow}>
                  <label className={styles.propLabel}>State Name</label>
                  <input
                    type="text"
                    className={styles.propInput}
                    data-testid="state-name-input"
                    value={selectedNode.name}
                    onChange={(e) =>
                      editorActions.updateStateNode(activeSm.id, selectedNode.id, {
                        name: e.target.value,
                      })
                    }
                  />
                </div>

                <div className={styles.propRow}>
                  <label className={styles.propLabel}>Node Type</label>
                  <select
                    className={styles.propSelect}
                    value={selectedNode.type}
                    onChange={(e) =>
                      editorActions.updateStateNode(activeSm.id, selectedNode.id, {
                        type: e.target.value as StateNodeType,
                      })
                    }
                  >
                    <option value="entry">Entry</option>
                    <option value="clip">Clip State</option>
                    <option value="blend1d">Blend 1D</option>
                    <option value="blend2d">Blend 2D</option>
                    <option value="pose">Pose</option>
                    <option value="exit">Exit</option>
                  </select>
                </div>

                {selectedNode.type === 'clip' && (
                  <>
                    <div className={styles.propRow}>
                      <label className={styles.propLabel}>Clip Name</label>
                      <input
                        type="text"
                        className={styles.propInput}
                        value={selectedNode.clipName || ''}
                        placeholder="Clip name (e.g. idle, walk)"
                        onChange={(e) =>
                          editorActions.updateStateNode(
                            activeSm.id,
                            selectedNode.id,
                            { clipName: e.target.value }
                          )
                        }
                        list="availableClipsList"
                      />
                      <datalist id="availableClipsList">
                        {availableClips.map((c) => (
                          <option key={c.id} value={c.name} />
                        ))}
                      </datalist>
                    </div>

                    <div className={styles.propRow}>
                      <label className={styles.boolToggle}>
                        <input
                          type="checkbox"
                          className={styles.boolCheckbox}
                          checked={Boolean(selectedNode.loop)}
                          onChange={(e) =>
                            editorActions.updateStateNode(
                              activeSm.id,
                              selectedNode.id,
                              { loop: e.target.checked }
                            )
                          }
                        />
                        <span>Loop Animation</span>
                      </label>
                    </div>

                    <div className={styles.propRow}>
                      <label className={styles.propLabel}>Playback Speed</label>
                      <input
                        type="number"
                        step="0.1"
                        className={styles.propInput}
                        value={selectedNode.speed ?? 1.0}
                        onChange={(e) =>
                          editorActions.updateStateNode(
                            activeSm.id,
                            selectedNode.id,
                            { speed: parseFloat(e.target.value) || 1.0 }
                          )
                        }
                      />
                    </div>
                  </>
                )}

                <button
                  type="button"
                  className={styles.deleteItemBtn}
                  onClick={() => {
                    editorActions.deleteStateNode(activeSm.id, selectedNode.id);
                    setSelectedItem(null);
                  }}
                >
                  <Trash2 size={12} /> Delete State Node
                </button>
              </>
            )}

            {selectedTransition && (
              <>
                <div className={styles.propRow}>
                  <label className={styles.propLabel}>From ➔ To</label>
                  <div style={{ color: '#93c5fd', fontSize: '11px' }}>
                    {
                      activeSm.states.find(
                        (s) => s.id === selectedTransition.fromStateId
                      )?.name
                    }{' '}
                    ➔{' '}
                    {
                      activeSm.states.find(
                        (s) => s.id === selectedTransition.toStateId
                      )?.name
                    }
                  </div>
                </div>

                <div className={styles.propRow}>
                  <label className={styles.propLabel}>Duration (ms)</label>
                  <input
                    type="number"
                    className={styles.propInput}
                    value={selectedTransition.durationMs ?? 150}
                    onChange={(e) =>
                      editorActions.updateStateTransition(
                        activeSm.id,
                        selectedTransition.id,
                        { durationMs: parseInt(e.target.value, 10) || 0 }
                      )
                    }
                  />
                </div>

                {/* Transition Condition Guards */}
                <div className={styles.propRow}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <label className={styles.propLabel}>Conditions</label>
                    <button
                      type="button"
                      className={styles.addBtn}
                      data-testid="add-condition-btn"
                      title="Add Condition"
                      onClick={() => {
                        const firstInput = activeSm.inputs?.[0];
                        const conditions = [
                          ...(selectedTransition.conditions || []),
                          {
                            inputId: firstInput?.id || '',
                            op: '==' as ConditionOperator,
                            value: firstInput?.type === 'number' ? 0 : true,
                          },
                        ];
                        editorActions.updateStateTransition(
                          activeSm.id,
                          selectedTransition.id,
                          { conditions }
                        );
                      }}
                    >
                      <Plus size={10} /> Add
                    </button>
                  </div>

                  {(!selectedTransition.conditions ||
                    selectedTransition.conditions.length === 0) && (
                    <div style={{ color: '#71717a', fontSize: '11px' }}>
                      No condition guards. (Transitions immediately)
                    </div>
                  )}

                  {selectedTransition.conditions?.map((cond, idx) => (
                    <div key={idx} className={styles.conditionRow}>
                      <select
                        className={styles.propSelect}
                        value={cond.inputId}
                        onChange={(e) => {
                          const conditions = [...selectedTransition.conditions];
                          conditions[idx] = { ...cond, inputId: e.target.value };
                          editorActions.updateStateTransition(
                            activeSm.id,
                            selectedTransition.id,
                            { conditions }
                          );
                        }}
                      >
                        {activeSm.inputs?.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>

                      <select
                        className={styles.propSelect}
                        value={cond.op}
                        onChange={(e) => {
                          const conditions = [...selectedTransition.conditions];
                          conditions[idx] = {
                            ...cond,
                            op: e.target.value as ConditionOperator,
                          };
                          editorActions.updateStateTransition(
                            activeSm.id,
                            selectedTransition.id,
                            { conditions }
                          );
                        }}
                      >
                        <option value="==">==</option>
                        <option value="!=">!=</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                      </select>

                      <input
                        type="text"
                        className={styles.propInput}
                        style={{ width: '45px' }}
                        value={String(cond.value)}
                        onChange={(e) => {
                          const val =
                            e.target.value === 'true'
                              ? true
                              : e.target.value === 'false'
                              ? false
                              : isNaN(Number(e.target.value))
                              ? e.target.value
                              : Number(e.target.value);
                          const conditions = [...selectedTransition.conditions];
                          conditions[idx] = { ...cond, value: val as any };
                          editorActions.updateStateTransition(
                            activeSm.id,
                            selectedTransition.id,
                            { conditions }
                          );
                        }}
                      />

                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => {
                          const conditions = selectedTransition.conditions.filter(
                            (_, i) => i !== idx
                          );
                          editorActions.updateStateTransition(
                            activeSm.id,
                            selectedTransition.id,
                            { conditions }
                          );
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className={styles.deleteItemBtn}
                  onClick={() => {
                    editorActions.deleteStateTransition(
                      activeSm.id,
                      selectedTransition.id
                    );
                    setSelectedItem(null);
                  }}
                >
                  <Trash2 size={12} /> Delete Transition
                </button>
              </>
            )}

            {!selectedItem && (
              <div style={{ color: '#71717a', fontSize: '11px', lineHeight: '1.4' }}>
                Select a state node or transition arrow in the graph to inspect and
                modify properties.
              </div>
            )}
          </div>

          {/* Section 2: ⚡ Game Listeners Section */}
          <div className={styles.inspectorSection}>
            <div className={styles.sectionHeader}>
              <span>⚡ Game Listeners</span>
              <button
                type="button"
                className={styles.addBtn}
                onClick={() =>
                  editorActions.addStateListener(activeSm.id, {
                    eventType: 'click',
                    actions: [],
                  })
                }
              >
                <Plus size={10} /> Add Listener
              </button>
            </div>

            {(!activeSm.listeners || activeSm.listeners.length === 0) && (
              <div style={{ color: '#71717a', fontSize: '11px' }}>
                No game event listeners configured.
              </div>
            )}

            {activeSm.listeners?.map((lis) => (
              <div key={lis.id} className={styles.listenerCard}>
                <div className={styles.listenerCardHeader}>
                  <select
                    className={styles.propSelect}
                    value={lis.eventType}
                    onChange={(e) =>
                      editorActions.updateStateListener(activeSm.id, lis.id, {
                        eventType: e.target.value as StateListenerEventType,
                      })
                    }
                  >
                    <option value="click">click</option>
                    <option value="pointerenter">pointerenter</option>
                    <option value="pointerleave">pointerleave</option>
                    <option value="pointerdown">pointerdown</option>
                    <option value="pointerup">pointerup</option>
                    <option value="collision">collision</option>
                    <option value="keydown">keydown</option>
                    <option value="keyup">keyup</option>
                    <option value="tick">tick</option>
                  </select>

                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() =>
                      editorActions.deleteStateListener(activeSm.id, lis.id)
                    }
                    title="Delete Listener"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {lis.eventType === 'collision' && (
                  <div className={styles.propRow}>
                    <label className={styles.propLabel}>Collision With Target</label>
                    <input
                      type="text"
                      className={styles.propInput}
                      placeholder="e.g. coin_1"
                      value={lis.collisionWithElementId || ''}
                      onChange={(e) =>
                        editorActions.updateStateListener(activeSm.id, lis.id, {
                          collisionWithElementId: e.target.value,
                        })
                      }
                    />
                  </div>
                )}

                {(lis.eventType === 'keydown' || lis.eventType === 'keyup') && (
                  <div className={styles.propRow}>
                    <label className={styles.propLabel}>Key Code</label>
                    <input
                      type="text"
                      className={styles.propInput}
                      placeholder="e.g. Space, ArrowUp"
                      value={lis.keyCode || ''}
                      onChange={(e) =>
                        editorActions.updateStateListener(activeSm.id, lis.id, {
                          keyCode: e.target.value,
                        })
                      }
                    />
                  </div>
                )}

                {/* Actions subsection */}
                <div className={styles.actionsContainer}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: '#a1a1aa' }}>
                      Actions ({lis.actions?.length || 0})
                    </span>
                    <button
                      type="button"
                      className={styles.addBtn}
                      style={{ padding: '1px 5px', fontSize: '10px' }}
                      onClick={() => {
                        const firstInput = activeSm.inputs?.[0];
                        const actions = [
                          ...(lis.actions || []),
                          {
                            type: 'fire_trigger' as StateListenerActionType,
                            inputId: firstInput?.id || '',
                          },
                        ];
                        editorActions.updateStateListener(activeSm.id, lis.id, {
                          actions,
                        });
                      }}
                    >
                      + Action
                    </button>
                  </div>

                  {lis.actions?.map((act, aIdx) => (
                    <div key={aIdx} className={styles.actionRow}>
                      <div className={styles.actionHeader}>
                        <select
                          className={styles.propSelect}
                          style={{ padding: '2px 4px', fontSize: '10px' }}
                          value={act.type}
                          onChange={(e) => {
                            const actions = [...lis.actions];
                            actions[aIdx] = {
                              ...act,
                              type: e.target.value as StateListenerActionType,
                            };
                            editorActions.updateStateListener(activeSm.id, lis.id, {
                              actions,
                            });
                          }}
                        >
                          <option value="fire_trigger">fire_trigger</option>
                          <option value="set_input">set_input</option>
                          <option value="change_input">change_input</option>
                          <option value="spawn_clip">spawn_clip</option>
                          <option value="play_sound">play_sound</option>
                        </select>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => {
                            const actions = lis.actions.filter((_, i) => i !== aIdx);
                            editorActions.updateStateListener(activeSm.id, lis.id, {
                              actions,
                            });
                          }}
                        >
                          <X size={10} />
                        </button>
                      </div>

                      <div className={styles.actionFields}>
                        {(act.type === 'fire_trigger' ||
                          act.type === 'set_input' ||
                          act.type === 'change_input') && (
                          <select
                            className={styles.propSelect}
                            style={{ flex: 1, fontSize: '10px', padding: '2px' }}
                            value={act.inputId || ''}
                            onChange={(e) => {
                              const actions = [...lis.actions];
                              actions[aIdx] = { ...act, inputId: e.target.value };
                              editorActions.updateStateListener(activeSm.id, lis.id, {
                                actions,
                              });
                            }}
                          >
                            <option value="">Select Input</option>
                            {activeSm.inputs?.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name}
                              </option>
                            ))}
                          </select>
                        )}

                        {act.type === 'set_input' && (
                          <input
                            type="text"
                            placeholder="Value"
                            className={styles.propInput}
                            style={{ width: '45px', padding: '2px 4px', fontSize: '10px' }}
                            value={String(act.value ?? '')}
                            onChange={(e) => {
                              const val =
                                e.target.value === 'true'
                                  ? true
                                  : e.target.value === 'false'
                                  ? false
                                  : isNaN(Number(e.target.value))
                                  ? e.target.value
                                  : Number(e.target.value);
                              const actions = [...lis.actions];
                              actions[aIdx] = { ...act, value: val as any };
                              editorActions.updateStateListener(activeSm.id, lis.id, {
                                actions,
                              });
                            }}
                          />
                        )}

                        {act.type === 'change_input' && (
                          <input
                            type="number"
                            placeholder="Delta"
                            className={styles.propInput}
                            style={{ width: '45px', padding: '2px 4px', fontSize: '10px' }}
                            value={act.delta ?? 1}
                            onChange={(e) => {
                              const actions = [...lis.actions];
                              actions[aIdx] = {
                                ...act,
                                delta: parseFloat(e.target.value) || 0,
                              };
                              editorActions.updateStateListener(activeSm.id, lis.id, {
                                actions,
                              });
                            }}
                          />
                        )}

                        {act.type === 'spawn_clip' && (
                          <input
                            type="text"
                            placeholder="Symbol / Clip ID"
                            className={styles.propInput}
                            style={{ flex: 1, padding: '2px 4px', fontSize: '10px' }}
                            value={act.symbolId || ''}
                            onChange={(e) => {
                              const actions = [...lis.actions];
                              actions[aIdx] = { ...act, symbolId: e.target.value };
                              editorActions.updateStateListener(activeSm.id, lis.id, {
                                actions,
                              });
                            }}
                          />
                        )}

                        {act.type === 'play_sound' && (
                          <input
                            type="text"
                            placeholder="Sound ID"
                            className={styles.propInput}
                            style={{ flex: 1, padding: '2px 4px', fontSize: '10px' }}
                            value={act.soundId || ''}
                            onChange={(e) => {
                              const actions = [...lis.actions];
                              actions[aIdx] = { ...act, soundId: e.target.value };
                              editorActions.updateStateListener(activeSm.id, lis.id, {
                                actions,
                              });
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
