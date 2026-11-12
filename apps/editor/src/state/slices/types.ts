import type {
  DisplayElement,
  KeyframeDef,
  LayerDef,
  StageDef,
  SymbolDef,
  SymbolInstance,
  SymbolKind,
  TimelineDef,
  Transform,
  Filter,
  FontAsset,
  Fill,
  ShapeElement,
  TextElement,
  TextSpan,
  BitmapElement,
  VideoElement,
  BitmapAsset,
  StageBreakpoint,
  ReducedMotionMode,
  I18nDef,
  LayoutPin,
  LayerKind,
  Easing,
  Artboard,
  CornerType,
  RectCornerRadius,
  RectCornerTypes,
  RectConfig,
  OvalConfig,
  StateVariable,
  StateVariableType,
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
import type { EditorDocument, ScriptSource } from '@flashback/serializer';
import type { Vector2D } from '../../utils/bezier';

export type EditorTool =
  | 'select'
  | 'subselect'
  | 'rect'
  | 'oval'
  | 'polygon'
  | 'pen'
  | 'text'
  | 'hand'
  | 'zoom'
  | 'pencil';

export type EditorLayer = EditorDocument['root']['layers'][number];
export type EditorKeyframe = EditorLayer['keyframes'][number];
export type EditorElement = EditorKeyframe['elements'][number];
export type EditorSymbol = EditorDocument['library']['symbols'][string];
export type EditorTimeline = EditorDocument['root'];
export type EditorArtboard = NonNullable<EditorDocument['artboards']>[number];

export interface ContextMenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
  danger?: boolean;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export interface HistoryState {
  undoStack: EditorDocument[];
  redoStack: EditorDocument[];
}

export interface SelectionState {
  selectedLayerId: string | null;
  selectedFrameIndex: number;
  selectedTime: number;
  selectedElementIds: string[];
  subselectedAnchor: { shapeId: string; pathIndex: number; anchorIndex: number } | null;
  editingTextElId: string | null;
  textSelection: { elementId: string; start: number; end: number } | null;
}

export interface PlaybackState {
  currentFrame: number;
  currentTime: number;
  isPlaying: boolean;
  loopMode: 'infinite' | number;
  scriptTriggerFocus: 'auto' | 'keyframe' | 'element';
  liveKeyframeScriptsEnabled: boolean;
}

export interface GeometryState {
  starConfig: { points: number; pointRatio: number; cornerRadius?: number };
  rectConfig: { cornerRadius: number | RectCornerRadius; cornerType: CornerType | RectCornerTypes };
  ovalConfig: { innerRadiusRatio: number; startAngle: number; endAngle: number };
  pencilConfig: {
    smoothness: number;
    fillNewStrokes?: boolean;
    keepSelected?: boolean;
    editSelectedPaths?: boolean;
  };
  isPencilOptionsOpen: boolean;
}

export interface UiModalsState {
  activeTool: EditorTool;
  fillColor: string;
  activeFill: Fill;
  strokeColor: string;
  activeStroke: Fill;
  strokeWidth: number;
  testMovieOpen: boolean;
  exportModalOpen: boolean;
  importModalOpen: boolean;
  convertToSymbolModalOpen: boolean;
  convertToComponentModalOpen: boolean;
  activeInspectorTab: 'timeline' | 'statemachine' | 'scripts' | 'properties';
  addFontModalOpen: boolean;
  bezierModalOpen: boolean;
  activeBezierTarget: {
    layerId: string;
    kfId: string;
    initialEasing?: Easing;
  } | null;
  clipboard: EditorElement[];
  keyframeClipboard: EditorKeyframe | null;
  contextMenu: ContextMenuState | null;
  isolationStack: Array<{ symbolId: string; name: string }>;
  previewLocale?: string;
  activeBreakpointId?: string | null;
  isLibraryOpen: boolean;
  libraryPosition: { x: number; y: number };
  isLocalizationOpen: boolean;
  localizationPosition: { x: number; y: number };
  isStateVariablesOpen: boolean;
  stateVariablesPosition: { x: number; y: number };
}

export interface EditorState
  extends HistoryState,
    SelectionState,
    PlaybackState,
    GeometryState,
    UiModalsState {
  doc: EditorDocument;
}

export type GetEditorState = () => EditorState;
export type SetEditorState = (
  updater: Partial<EditorState> | ((prevState: EditorState) => Partial<EditorState>),
  options?: { skipNotify?: boolean }
) => void;

export interface SliceContext {
  getState: GetEditorState;
  setState: SetEditorState;
  pushHistorySnapshot: () => void;
  notify: () => void;
  getActions: () => any;
  getActiveTimeline: (doc: EditorDocument, isolationStack?: Array<{ symbolId: string; name: string }>) => EditorTimeline;
  computeTotalTimelineDuration: (tl: EditorTimeline, fps?: number) => number;
  getKeyframeTime: (kf: EditorKeyframe, fps?: number) => number;
  findKeyframeAt: (layer: EditorLayer, frameIndex: number) => EditorKeyframe | undefined;
  findKeyframeAtTime: (layer: EditorLayer, time: number, fps?: number) => EditorKeyframe | undefined;
  normalizeLayerKeyframes?: (layer: EditorLayer, fps?: number) => void;
  getActiveArtboard?: (doc: EditorDocument) => any;
}

export type SliceCreator<TActions> = (context: SliceContext) => TActions;

/* Slice Action Interfaces */

export interface HistorySliceActions {
  commitHistorySnapshot(): void;
  undo(): void;
  redo(): void;
}

export interface SelectionSliceActions {
  selectLayer(layerId: string, preserveElementSelection?: boolean): void;
  setSelectedFrame(layerId: string, frameIndexOrTime: number): void;
  setSelectedTime(layerId: string, time: number): void;
  selectElement(elementId: string, multiSelect?: boolean): void;
  selectElements(elementIds: string[]): void;
  deselectAll(): void;
  selectAll(): void;
  setSubselectedAnchor(anchor: { shapeId: string; pathIndex: number; anchorIndex: number } | null): void;
  setEditingTextElId(id: string | null): void;
  setTextSelection(selection: { elementId: string; start: number; end: number } | null): void;
}

export interface PlaybackSliceActions {
  setLoopMode(mode: 'infinite' | number): void;
  toggleLoopMode(): void;
  setPlayhead(frame: number): void;
  setPlayheadTime(timeInSeconds: number): void;
  setCurrentFrame(frameIndex: number): void;
  setCurrentTime(timeInSeconds: number): void;
  setPlaying(playing: boolean): void;
  play(): void;
  stop(): void;
  togglePlay(): void;
  rewind(): void;
  stepForward(stepSec?: number): void;
  stepBackward(stepSec?: number): void;
  reverseFrames?(layerId?: string): void;
  setScriptTriggerFocus(focus: 'auto' | 'keyframe' | 'element'): void;
  setLiveKeyframeScriptsEnabled(enabled: boolean): void;
  openKeyframeScript(layerId: string, frameIndexOrTime: number, isTime?: boolean): void;
  executeKeyframeScriptsInRange(prevTime: number, nextTime: number, includeZeroStart?: boolean): void;
}

export interface StateMachineSliceActions {
  addStateVariable(variable: {
    name: string;
    type: StateVariableType;
    defaultValue: any;
    isPublic?: boolean;
    description?: string;
  }): void;
  updateStateVariable(id: string, updates: Partial<StateVariable>): void;
  deleteStateVariable(id: string): void;
  addStateMachine(name?: string): StateMachineDef;
  setActiveStateMachine(id: string): void;
  deleteStateMachine(smId: string): void;
  addStateMachineInput(
    smId: string,
    input: { name: string; type: 'boolean' | 'number' | 'trigger'; value: boolean | number }
  ): void;
  updateStateMachineInput(smId: string, inputId: string, updates: Partial<StateMachineInput>): void;
  deleteStateMachineInput(smId: string, inputId: string): void;
  addStateNode(
    smId: string,
    node: { name: string; type: StateNodeType; x?: number; y?: number; clipName?: string; timelineId?: string }
  ): void;
  updateStateNode(smId: string, nodeId: string, updates: Partial<StateNode>): void;
  deleteStateNode(smId: string, nodeId: string): void;
  addStateTransition(
    smId: string,
    transition: { fromStateId: string; toStateId: string; durationMs?: number; conditions?: StateCondition[] }
  ): void;
  updateStateTransition(smId: string, transitionId: string, updates: Partial<StateTransition>): void;
  deleteStateTransition(smId: string, transitionId: string): void;
  addStateListener(smId: string, listener: Partial<StateListener>): void;
  updateStateListener(smId: string, listenerId: string, updates: Partial<StateListener>): void;
  deleteStateListener(smId: string, listenerId: string): void;
  setTextStateBinding(elementId: string, stateBinding?: string | null): void;
}

export interface GeometrySliceActions {
  setStarConfig(config: Partial<{ points: number; pointRatio: number; cornerRadius?: number }>): void;
  setRectConfig(config: Partial<{ width?: number; height?: number; cornerRadius: number | RectCornerRadius; cornerType: CornerType | RectCornerTypes }>): void;
  setOvalConfig(config: Partial<{ innerRadiusRatio: number; startAngle: number; endAngle: number }>): void;
  setPencilConfig(config: Partial<{ smoothness: number; fillNewStrokes?: boolean; keepSelected?: boolean; editSelectedPaths?: boolean }>): void;
  setPencilOptionsOpen(open: boolean): void;
  reSmoothSelectedShape(smoothness: number): void;
  createPencilShape(points: Array<{ x: number; y: number }>, options?: { smoothness?: number; strokeColor?: string; strokeWidth?: number; fillNewStrokes?: boolean }): ShapeElement | null;
  uniteSelectedShapes(): void;
  subtractSelectedShapes(): void;
  intersectSelectedShapes(): void;
  excludeSelectedShapes(): void;
  outlineSelectedStroke(): void;
  convertSelectedTextToOutlines(): Promise<void>;
  openShapePath(elementId?: string): void;
  closeShapePath(elementId?: string): void;
  togglePathClosed(elementId?: string): void;
  slicePathAtPoint(elementId: string, pt: Vector2D): void;
  togglePathAnchorPointType(shapeId: string, anchorIndex: number, pathIndex?: number): void;
  setPathAnchorPointType(shapeId: string, anchorIndex: number, pointType: 'smooth' | 'corner', pathIndex?: number): void;
  updateStarShape(
    elementId: string,
    configUpdates: Partial<{ points: number; pointRatio: number; cornerRadius?: number }>,
    options?: { skipHistory?: boolean; force?: boolean }
  ): void;
  resetStarShapeToParametric(elementId: string, options?: { skipHistory?: boolean }): void;
  updateRectShape(
    elementId: string,
    configUpdates: Partial<{
      width?: number;
      height?: number;
      cornerRadius: number | RectCornerRadius;
      cornerType: CornerType | RectCornerTypes;
    }>,
    options?: { skipHistory?: boolean }
  ): void;
  resetRectShapeToParametric(elementId: string, options?: { skipHistory?: boolean }): void;
  insertPathAnchor(
    elementId: string,
    pathIndex?: number,
    segmentIndex?: number,
    t?: number,
    options?: { skipHistory?: boolean }
  ): number | null;
  deletePathAnchor(
    elementId: string,
    anchorIndex: number,
    pathIndex?: number,
    options?: { skipHistory?: boolean }
  ): void;
  updateShapeCornerRadius(
    elementId: string,
    config: {
      cornerRadius?: number;
      cornerType?: CornerType;
      anchorRadii?: Record<number, number>;
      anchorTypes?: Record<number, CornerType>;
    },
    options?: { skipHistory?: boolean }
  ): void;
  updateOvalShape(
    elementId: string,
    configUpdates: Partial<{
      rx?: number;
      ry?: number;
      innerRadiusRatio: number;
      startAngle: number;
      endAngle: number;
    }>,
    options?: { skipHistory?: boolean }
  ): void;
  resetOvalShapeToParametric(elementId: string, options?: { skipHistory?: boolean }): void;
  morphShapeTo(elementId: string, targetType: 'circle' | 'rectangle' | 'star'): void;
}

export interface UiModalsSliceActions {
  setActiveTool(tool: EditorTool): void;
  setFillColor(color: string): void;
  setActiveFill(fill: Fill): void;
  setStrokeColor(color: string): void;
  setActiveStroke(fill: Fill): void;
  setStrokeWidth(width: number): void;
  setTestMovieOpen(open: boolean): void;
  setExportModalOpen(open: boolean): void;
  setImportModalOpen(open: boolean): void;
  setActiveInspectorTab(tab: 'timeline' | 'statemachine' | 'scripts' | 'properties'): void;
  setConvertToComponentModalOpen(open: boolean): void;
  setConvertToSymbolModalOpen(open: boolean): void;
  setAddFontModalOpen(open: boolean): void;
  openBezierEditor(layerId: string, kfId: string, initialEasing?: Easing): void;
  closeBezierEditor(): void;
  addWebFont(font: {
    name: string;
    url: string;
    format?: 'woff2' | 'css';
    weight?: number | `${number} ${number}` | number[];
    style?: 'normal' | 'italic' | 'all';
    variableRange?: { min: number; max: number; default?: number };
    availableWeights?: number[];
    availableStyles?: Array<'normal' | 'italic'>;
  }): string;
  openContextMenu(menu: { x: number; y: number; items: ContextMenuItem[] }): void;
  closeContextMenu(): void;
  setLibraryOpen(open: boolean): void;
  toggleLibrary(): void;
  setLibraryPosition(pos: { x: number; y: number }): void;
  setLocalizationOpen(open: boolean): void;
  toggleLocalization(): void;
  setLocalizationPosition(pos: { x: number; y: number }): void;
  setStateVariablesOpen(open: boolean): void;
  toggleStateVariables(): void;
  setStateVariablesPosition(pos: { x: number; y: number }): void;
}
