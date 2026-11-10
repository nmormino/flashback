/**
 * Scratch-Style Visual Scripting Block Model, Compiler & Parser
 */

export type ScriptBlockCategory =
  | 'variables'
  | 'control'
  | 'events'
  | 'timeline'
  | 'navigation'
  | 'motion'
  | 'particles'
  | 'dialogs'
  | 'custom';

export type ScriptBlockType =
  // Events
  | 'emit_custom_event'
  | 'on_custom_event'
  // Variables
  | 'set_state_var'
  | 'change_state_var'
  // Control & Logic
  | 'if_condition'
  | 'if_else'
  | 'switch_case'
  | 'for_each'
  | 'repeat_times'
  | 'while_loop'
  | 'do_while'
  // Dialogs
  | 'alert'
  | 'console_log'
  // Timeline
  | 'stop'
  | 'play'
  | 'goto_and_play'
  | 'goto_and_stop'
  | 'next_frame'
  | 'prev_frame'
  | 'wait_play'
  // Navigation
  | 'goto_artboard'
  | 'open_url'
  // Motion & Spawning
  | 'move_by'
  | 'set_position'
  | 'rotate_by'
  | 'set_rotation'
  | 'set_scale'
  | 'set_opacity'
  | 'toggle_visible'
  | 'set_visible'
  | 'spawn_clip'
  // Particles
  | 'emit_particles'
  // Custom
  | 'custom_js';

export interface ScriptBlock {
  id: string;
  type: ScriptBlockType;
  params: Record<string, any>;
}

export interface BlockCatalogItem {
  type: ScriptBlockType;
  category: ScriptBlockCategory;
  name: string;
  summary: string;
  icon: string;
  color: string;
  defaultParams: Record<string, any>;
}

export interface CategoryMetadata {
  id: ScriptBlockCategory;
  name: string;
  color: string;
  icon: string;
  description: string;
}

export const CATEGORY_METADATA: Record<ScriptBlockCategory, CategoryMetadata> = {
  variables: {
    id: 'variables',
    name: 'State & Variables',
    color: '#8b5cf6',
    icon: '📦',
    description: 'Read and update reactive state variables',
  },
  control: {
    id: 'control',
    name: 'Control & Logic',
    color: '#0ea5e9',
    icon: '🔀',
    description: 'Conditionals, loops, iterations and branching',
  },
  events: {
    id: 'events',
    name: 'Events',
    color: '#f59e0b',
    icon: '⚡',
    description: 'Custom event bus broadcast and listeners',
  },
  timeline: {
    id: 'timeline',
    name: 'Timeline Control',
    color: '#3b82f6',
    icon: '⏱️',
    description: 'Play, stop, jump frames and delays',
  },
  navigation: {
    id: 'navigation',
    name: 'Navigation & URLs',
    color: '#a855f7',
    icon: '🧭',
    description: 'Switch artboards and open web links',
  },
  motion: {
    id: 'motion',
    name: 'Motion & Transform',
    color: '#10b981',
    icon: '✨',
    description: 'Move, rotate, scale, alpha, and spawn clips',
  },
  particles: {
    id: 'particles',
    name: 'Particles & Effects',
    color: '#ec4899',
    icon: '🎆',
    description: 'Confetti, splat, sparks, and particle generation',
  },
  dialogs: {
    id: 'dialogs',
    name: 'Dialogs & Logs',
    color: '#eab308',
    icon: '💬',
    description: 'Popup alerts and debugging console logs',
  },
  custom: {
    id: 'custom',
    name: 'Custom JavaScript',
    color: '#6366f1',
    icon: '⚙️',
    description: 'Inline raw JavaScript override blocks',
  },
};

export const BLOCK_CATALOG: BlockCatalogItem[] = [
  // State Variables
  {
    type: 'set_state_var',
    category: 'variables',
    name: 'Set State Variable',
    summary: 'Assign value to shared state variable',
    icon: '📦',
    color: '#8b5cf6',
    defaultParams: { variable: 'score', value: '10' },
  },
  {
    type: 'change_state_var',
    category: 'variables',
    name: 'Change State Variable',
    summary: 'Increment/decrement numeric state variable',
    icon: '➕',
    color: '#8b5cf6',
    defaultParams: { variable: 'score', delta: 1 },
  },

  // Control & Logic
  {
    type: 'if_condition',
    category: 'control',
    name: 'If Condition',
    summary: 'Execute action only if condition is true',
    icon: '❓',
    color: '#0ea5e9',
    defaultParams: {
      condition: 'this.state.score >= 100',
      thenAction: 'this.play();',
      thenBlocks: [],
    },
  },
  {
    type: 'if_else',
    category: 'control',
    name: 'If / Else',
    summary: 'Branch between two actions based on condition',
    icon: '🔀',
    color: '#0ea5e9',
    defaultParams: {
      condition: 'this.state.score >= 100',
      thenAction: 'this.play();',
      thenBlocks: [],
      elseAction: 'this.stop();',
      elseBlocks: [],
    },
  },
  {
    type: 'switch_case',
    category: 'control',
    name: 'Switch / Case',
    summary: 'Evaluate value against multiple case options',
    icon: '🗂️',
    color: '#0ea5e9',
    defaultParams: {
      expression: 'this.state.level',
      case1: '1',
      action1: 'this.gotoAndPlay(1);',
      caseBlocks: [],
      defaultAction: 'this.stop();',
      defaultBlocks: [],
    },
  },
  {
    type: 'for_each',
    category: 'control',
    name: 'For Each Loop',
    summary: 'Iterate over elements in an array',
    icon: '🔁',
    color: '#0ea5e9',
    defaultParams: {
      array: '[1, 2, 3]',
      item: 'item',
      body: 'console.log(item);',
      bodyBlocks: [],
    },
  },
  {
    type: 'repeat_times',
    category: 'control',
    name: 'Repeat Times',
    summary: 'Loop and repeat action N times',
    icon: '🔢',
    color: '#0ea5e9',
    defaultParams: {
      times: 5,
      indexVar: 'i',
      body: 'this.spawnClip("Fly", { x: i * 20, y: 50 });',
      bodyBlocks: [],
    },
  },
  {
    type: 'while_loop',
    category: 'control',
    name: 'While Loop',
    summary: 'Loop while expression evaluates to true',
    icon: '🔄',
    color: '#0ea5e9',
    defaultParams: {
      condition: 'this.x < 300',
      body: 'this.x += 10;',
      bodyBlocks: [],
    },
  },
  {
    type: 'do_while',
    category: 'control',
    name: 'Do While Loop',
    summary: 'Execute once then repeat while condition holds',
    icon: '🔃',
    color: '#0ea5e9',
    defaultParams: {
      condition: 'this.x < 300',
      body: 'this.x += 10;',
      bodyBlocks: [],
    },
  },

  // Events
  {
    type: 'emit_custom_event',
    category: 'events',
    name: 'Emit Custom Event',
    summary: 'Broadcast event to other clips and host page',
    icon: '📡',
    color: '#f59e0b',
    defaultParams: { event: 'custom_event', payload: '' },
  },
  {
    type: 'on_custom_event',
    category: 'events',
    name: 'Listen for Event',
    summary: 'Run action when custom event is received',
    icon: '👂',
    color: '#f59e0b',
    defaultParams: { event: 'custom_event', action: 'this.play();' },
  },

  // Dialogs
  {
    type: 'alert',
    category: 'dialogs',
    name: 'Alert',
    summary: 'Display popup message',
    icon: '💬',
    color: '#f59e0b',
    defaultParams: { message: 'Hello!' },
  },
  {
    type: 'console_log',
    category: 'dialogs',
    name: 'Console Log',
    summary: 'Log message to console',
    icon: '📝',
    color: '#f59e0b',
    defaultParams: { message: 'Frame reached' },
  },

  // Timeline
  {
    type: 'stop',
    category: 'timeline',
    name: 'Stop Timeline',
    summary: 'Stop playback at this frame',
    icon: '⏹',
    color: '#3b82f6',
    defaultParams: {},
  },
  {
    type: 'play',
    category: 'timeline',
    name: 'Play Timeline',
    summary: 'Resume playback',
    icon: '▶',
    color: '#3b82f6',
    defaultParams: {},
  },
  {
    type: 'goto_and_play',
    category: 'timeline',
    name: 'Go to Frame & Play',
    summary: 'Jump to frame number and play',
    icon: '⏩',
    color: '#3b82f6',
    defaultParams: { frame: 1 },
  },
  {
    type: 'goto_and_stop',
    category: 'timeline',
    name: 'Go to Frame & Stop',
    summary: 'Jump to frame number and stop',
    icon: '⏸',
    color: '#3b82f6',
    defaultParams: { frame: 1 },
  },
  {
    type: 'next_frame',
    category: 'timeline',
    name: 'Next Frame',
    summary: 'Advance forward by 1 frame',
    icon: '⏭',
    color: '#3b82f6',
    defaultParams: {},
  },
  {
    type: 'prev_frame',
    category: 'timeline',
    name: 'Previous Frame',
    summary: 'Step backward by 1 frame',
    icon: '⏮',
    color: '#3b82f6',
    defaultParams: {},
  },
  {
    type: 'wait_play',
    category: 'timeline',
    name: 'Wait & Play',
    summary: 'Pause for N seconds then play',
    icon: '⏳',
    color: '#3b82f6',
    defaultParams: { seconds: 1 },
  },

  // Navigation
  {
    type: 'goto_artboard',
    category: 'navigation',
    name: 'Go to Artboard',
    summary: 'Transition to another artboard',
    icon: '🖼️',
    color: '#8b5cf6',
    defaultParams: { artboardId: '', transition: 'none', duration: 300 },
  },
  {
    type: 'open_url',
    category: 'navigation',
    name: 'Open URL',
    summary: 'Open external web link',
    icon: '🔗',
    color: '#8b5cf6',
    defaultParams: { url: 'https://', target: '_blank' },
  },

  // Motion
  {
    type: 'move_by',
    category: 'motion',
    name: 'Change Position By',
    summary: 'Offset position by dx, dy',
    icon: '↔️',
    color: '#10b981',
    defaultParams: { dx: 10, dy: 0 },
  },
  {
    type: 'set_position',
    category: 'motion',
    name: 'Set Position',
    summary: 'Set absolute X and Y coordinates',
    icon: '📍',
    color: '#10b981',
    defaultParams: { x: 0, y: 0 },
  },
  {
    type: 'rotate_by',
    category: 'motion',
    name: 'Rotate By',
    summary: 'Rotate element by degrees',
    icon: '🔄',
    color: '#10b981',
    defaultParams: { degrees: 15 },
  },
  {
    type: 'set_rotation',
    category: 'motion',
    name: 'Set Rotation',
    summary: 'Set absolute rotation in degrees',
    icon: '📐',
    color: '#10b981',
    defaultParams: { degrees: 0 },
  },
  {
    type: 'set_scale',
    category: 'motion',
    name: 'Set Scale',
    summary: 'Scale width and height by percent',
    icon: '🔍',
    color: '#10b981',
    defaultParams: { percent: 100 },
  },
  {
    type: 'set_opacity',
    category: 'motion',
    name: 'Set Opacity',
    summary: 'Set opacity from 0% to 100%',
    icon: '👁️',
    color: '#10b981',
    defaultParams: { percent: 100 },
  },
  {
    type: 'toggle_visible',
    category: 'motion',
    name: 'Toggle Visibility',
    summary: 'Invert visibility state',
    icon: '👁️‍🗨️',
    color: '#10b981',
    defaultParams: {},
  },
  {
    type: 'set_visible',
    category: 'motion',
    name: 'Set Visibility',
    summary: 'Show or hide element',
    icon: '💡',
    color: '#10b981',
    defaultParams: { visible: true },
  },
  {
    type: 'spawn_clip',
    category: 'motion',
    name: 'Spawn Clip',
    summary: 'Dynamically instantiate clip from library',
    icon: '🐣',
    color: '#10b981',
    defaultParams: { clipName: '', x: 0, y: 0 },
  },

  // Particles
  {
    type: 'emit_particles',
    category: 'particles',
    name: 'Emit Particles',
    summary: 'Trigger particle generator with preset',
    icon: '🎆',
    color: '#ec4899',
    defaultParams: { preset: 'splat', x: 0, y: 0, particleCount: 50 },
  },

  // Custom
  {
    type: 'custom_js',
    category: 'custom',
    name: 'Custom JavaScript',
    summary: 'Execute raw inline JavaScript',
    icon: '⚡',
    color: '#ec4899',
    defaultParams: { code: '// custom code' },
  },
];

let blockCounter = 0;

/**
 * Creates a new block instance with default parameters merged with provided parameters.
 */
export function createBlock(
  type: ScriptBlockType,
  defaultParams?: Partial<Record<string, any>>
): ScriptBlock {
  const item = BLOCK_CATALOG.find((b) => b.type === type);
  const baseParams = item ? { ...item.defaultParams } : {};
  return {
    id: `blk_${Date.now()}_${++blockCounter}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    params: {
      ...baseParams,
      ...(defaultParams || {}),
    },
  };
}

/**
 * Compiles an array of ScriptBlock objects into clean, executable JavaScript code with recursive indentation.
 */
export function compileBlocksToJS(blocks: ScriptBlock[], indentLevel = 0): string {
  if (!blocks || blocks.length === 0) return '';
  const indent = '  '.repeat(indentLevel);
  const nextIndent = '  '.repeat(indentLevel + 1);

  const statements: string[] = [];

  for (const block of blocks) {
    const params = block.params || {};

    switch (block.type) {
      case 'alert': {
        const msg = String(params.message ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        statements.push(`${indent}alert('${msg}');`);
        break;
      }
      case 'console_log': {
        const msg = String(params.message ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        statements.push(`${indent}console.log('${msg}');`);
        break;
      }
      case 'stop': {
        statements.push(`${indent}this.stop();`);
        break;
      }
      case 'play': {
        statements.push(`${indent}this.play();`);
        break;
      }
      case 'goto_and_play': {
        const frame = Number(params.frame) || 1;
        statements.push(`${indent}this.gotoAndPlay(${frame});`);
        break;
      }
      case 'goto_and_stop': {
        const frame = Number(params.frame) || 1;
        statements.push(`${indent}this.gotoAndStop(${frame});`);
        break;
      }
      case 'next_frame': {
        statements.push(`${indent}this.nextFrame();`);
        break;
      }
      case 'prev_frame': {
        statements.push(`${indent}this.prevFrame();`);
        break;
      }
      case 'wait_play': {
        const seconds = Number(params.seconds) || 1;
        const ms = seconds * 1000;
        statements.push(`${indent}setTimeout(() => {\n${nextIndent}this.play();\n${indent}}, ${ms});`);
        break;
      }
      case 'goto_artboard': {
        const abId = String(params.artboardId || '').replace(/'/g, "\\'");
        const transition = params.transition || 'none';
        const duration = Number(params.duration) || 300;
        if (transition === 'none') {
          statements.push(`${indent}gotoArtboard('${abId}');`);
        } else {
          statements.push(
            `${indent}gotoArtboard('${abId}', { type: '${transition}', duration: ${duration} });`
          );
        }
        break;
      }
      case 'open_url': {
        const url = String(params.url || '').replace(/'/g, "\\'");
        const target = params.target === '_self' ? '_self' : '_blank';
        statements.push(`${indent}window.open('${url}', '${target}');`);
        break;
      }
      case 'move_by': {
        const dx = Number(params.dx) || 0;
        const dy = Number(params.dy) || 0;
        if (dx !== 0 && dy !== 0) {
          statements.push(`${indent}this.x += ${dx};\n${indent}this.y += ${dy};`);
        } else if (dx !== 0) {
          statements.push(`${indent}this.x += ${dx};`);
        } else if (dy !== 0) {
          statements.push(`${indent}this.y += ${dy};`);
        } else {
          statements.push(`${indent}this.x += 0;\n${indent}this.y += 0;`);
        }
        break;
      }
      case 'set_position': {
        const x = Number(params.x) || 0;
        const y = Number(params.y) || 0;
        statements.push(`${indent}this.x = ${x};\n${indent}this.y = ${y};`);
        break;
      }
      case 'rotate_by': {
        const deg = Number(params.degrees) || 0;
        statements.push(`${indent}this.rotation += ${deg};`);
        break;
      }
      case 'set_rotation': {
        const deg = Number(params.degrees) || 0;
        statements.push(`${indent}this.rotation = ${deg};`);
        break;
      }
      case 'set_scale': {
        const pct = Number(params.percent) ?? 100;
        const s = pct / 100;
        statements.push(`${indent}this.scaleX = ${s};\n${indent}this.scaleY = ${s};`);
        break;
      }
      case 'set_opacity': {
        const pct = Number(params.percent) ?? 100;
        const a = pct / 100;
        statements.push(`${indent}this.alpha = ${a};`);
        break;
      }
      case 'toggle_visible': {
        statements.push(`${indent}this.visible = !this.visible;`);
        break;
      }
      case 'set_visible': {
        const visible = Boolean(params.visible);
        statements.push(`${indent}this.visible = ${visible};`);
        break;
      }
      case 'set_state_var': {
        const varName = String(params.variable || 'score').trim() || 'score';
        const rawVal = params.value ?? '0';
        const isNum = !isNaN(Number(rawVal)) && String(rawVal).trim() !== '';
        const isBool = rawVal === 'true' || rawVal === 'false';
        const valStr = isNum || isBool ? String(rawVal).trim() : `'${String(rawVal).replace(/'/g, "\\'")}'`;
        statements.push(`${indent}this.state.${varName} = ${valStr};`);
        break;
      }
      case 'change_state_var': {
        const varName = String(params.variable || 'score').trim() || 'score';
        const delta = Number(params.delta) || 1;
        statements.push(`${indent}this.state.${varName} += ${delta};`);
        break;
      }
      case 'emit_custom_event': {
        const ev = String(params.event || '').replace(/'/g, "\\'");
        const payload = String(params.payload ?? '').trim();
        if (payload) {
          statements.push(`${indent}this.emit('${ev}', ${payload});`);
        } else {
          statements.push(`${indent}this.emit('${ev}');`);
        }
        break;
      }
      case 'on_custom_event': {
        const ev = String(params.event || '').replace(/'/g, "\\'");
        let inner = '';
        if (Array.isArray(params.actionBlocks) && params.actionBlocks.length > 0) {
          inner = compileBlocksToJS(params.actionBlocks, indentLevel + 1);
        } else {
          const action = String(params.action || 'this.play();').trim();
          inner = action
            .split('\n')
            .map((line) => `${nextIndent}${line}`)
            .join('\n');
        }
        statements.push(`${indent}this.on('${ev}', () => {\n${inner}\n${indent}});`);
        break;
      }
      case 'if_condition': {
        const cond = String(params.condition || 'true').trim();
        let inner = '';
        if (Array.isArray(params.thenBlocks) && params.thenBlocks.length > 0) {
          inner = compileBlocksToJS(params.thenBlocks, indentLevel + 1);
        } else {
          const action = String(params.thenAction || 'this.play();').trim();
          inner = action
            .split('\n')
            .map((line) => `${nextIndent}${line}`)
            .join('\n');
        }
        statements.push(`${indent}if (${cond}) {\n${inner}\n${indent}}`);
        break;
      }
      case 'if_else': {
        const cond = String(params.condition || 'true').trim();
        let thenInner = '';
        if (Array.isArray(params.thenBlocks) && params.thenBlocks.length > 0) {
          thenInner = compileBlocksToJS(params.thenBlocks, indentLevel + 1);
        } else {
          const action = String(params.thenAction || 'this.play();').trim();
          thenInner = action
            .split('\n')
            .map((line) => `${nextIndent}${line}`)
            .join('\n');
        }
        let elseInner = '';
        if (Array.isArray(params.elseBlocks) && params.elseBlocks.length > 0) {
          elseInner = compileBlocksToJS(params.elseBlocks, indentLevel + 1);
        } else {
          const action = String(params.elseAction || 'this.stop();').trim();
          elseInner = action
            .split('\n')
            .map((line) => `${nextIndent}${line}`)
            .join('\n');
        }
        statements.push(`${indent}if (${cond}) {\n${thenInner}\n${indent}} else {\n${elseInner}\n${indent}}`);
        break;
      }
      case 'switch_case': {
        const expr = String(params.expression || 'val').trim();
        const case1 = String(params.case1 ?? '1').trim();
        let action1 = '';
        if (Array.isArray(params.caseBlocks) && params.caseBlocks.length > 0) {
          action1 = compileBlocksToJS(params.caseBlocks, indentLevel + 2);
        } else {
          const act = String(params.action1 || '').trim();
          action1 = act ? act.split('\n').map((l) => `${nextIndent}  ${l}`).join('\n') : '';
        }
        let defaultAction = '';
        if (Array.isArray(params.defaultBlocks) && params.defaultBlocks.length > 0) {
          defaultAction = compileBlocksToJS(params.defaultBlocks, indentLevel + 2);
        } else {
          const def = String(params.defaultAction || '').trim();
          defaultAction = def ? def.split('\n').map((l) => `${nextIndent}  ${l}`).join('\n') : '';
        }
        statements.push(
          `${indent}switch (${expr}) {\n${nextIndent}case ${case1}:\n${action1}\n${nextIndent}  break;\n${nextIndent}default:\n${defaultAction}\n${nextIndent}  break;\n${indent}}`
        );
        break;
      }
      case 'for_each': {
        const arr = String(params.array || 'items').trim();
        const it = String(params.item || 'item').trim();
        let inner = '';
        if (Array.isArray(params.bodyBlocks) && params.bodyBlocks.length > 0) {
          inner = compileBlocksToJS(params.bodyBlocks, indentLevel + 1);
        } else {
          const body = String(params.body || 'console.log(item);').trim();
          inner = body
            .split('\n')
            .map((line) => `${nextIndent}${line}`)
            .join('\n');
        }
        statements.push(`${indent}for (const ${it} of ${arr}) {\n${inner}\n${indent}}`);
        break;
      }
      case 'repeat_times': {
        const count = Number(params.times) || 5;
        const indexVar = String(params.indexVar || 'i').trim();
        let inner = '';
        if (Array.isArray(params.bodyBlocks) && params.bodyBlocks.length > 0) {
          inner = compileBlocksToJS(params.bodyBlocks, indentLevel + 1);
        } else {
          const body = String(params.body || '').trim();
          inner = body
            ? body
                .split('\n')
                .map((line) => `${nextIndent}${line}`)
                .join('\n')
            : `${nextIndent}// loop body`;
        }
        statements.push(`${indent}for (let ${indexVar} = 0; ${indexVar} < ${count}; ${indexVar}++) {\n${inner}\n${indent}}`);
        break;
      }
      case 'while_loop': {
        const cond = String(params.condition || 'true').trim();
        let inner = '';
        if (Array.isArray(params.bodyBlocks) && params.bodyBlocks.length > 0) {
          inner = compileBlocksToJS(params.bodyBlocks, indentLevel + 1);
        } else {
          const body = String(params.body || '').trim();
          inner = body
            ? body
                .split('\n')
                .map((line) => `${nextIndent}${line}`)
                .join('\n')
            : `${nextIndent}// loop body`;
        }
        statements.push(`${indent}while (${cond}) {\n${inner}\n${indent}}`);
        break;
      }
      case 'do_while': {
        const cond = String(params.condition || 'true').trim();
        let inner = '';
        if (Array.isArray(params.bodyBlocks) && params.bodyBlocks.length > 0) {
          inner = compileBlocksToJS(params.bodyBlocks, indentLevel + 1);
        } else {
          const body = String(params.body || '').trim();
          inner = body
            ? body
                .split('\n')
                .map((line) => `${nextIndent}${line}`)
                .join('\n')
            : `${nextIndent}// loop body`;
        }
        statements.push(`${indent}do {\n${inner}\n${indent}} while (${cond});`);
        break;
      }
      case 'spawn_clip': {
        const clipName = String(params.clipName || '').replace(/'/g, "\\'");
        const x = Number(params.x) || 0;
        const y = Number(params.y) || 0;
        statements.push(`${indent}this.spawnClip('${clipName}', { x: ${x}, y: ${y} });`);
        break;
      }
      case 'emit_particles': {
        const preset = String(params.preset || 'splat').replace(/'/g, "\\'");
        const x = Number(params.x) || 0;
        const y = Number(params.y) || 0;
        const count = Number(params.particleCount) || 50;
        statements.push(
          `${indent}this.emitParticles({ preset: '${preset}', x: ${x}, y: ${y}, particleCount: ${count} });`
        );
        break;
      }
      case 'custom_js': {
        const code = String(params.code ?? '').trim();
        if (code) {
          const indentedCode = code
            .split('\n')
            .map((line) => `${indent}${line}`)
            .join('\n');
          statements.push(indentedCode);
        }
        break;
      }
    }
  }

  return statements.join('\n');
}

/**
 * Helper to extract matching balanced braces { ... } starting at openIndex.
 */
function extractBalancedBraces(
  code: string,
  openIndex: number
): { content: string; openIndex: number; endIndex: number } | null {
  if (openIndex < 0 || openIndex >= code.length || code[openIndex] !== '{') {
    return null;
  }

  let depth = 0;
  let inString: string | null = null;
  let escape = false;

  for (let i = openIndex; i < code.length; i++) {
    const ch = code[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }

    if (inString) {
      if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return {
          content: code.slice(openIndex + 1, i),
          openIndex,
          endIndex: i,
        };
      }
    }
  }

  return null;
}

/**
 * Parses raw JavaScript code into an array of visual ScriptBlock objects, supporting nested blocks.
 */
export function parseJSIntoBlocks(code: string): ScriptBlock[] {
  if (!code || !code.trim()) return [];

  let remaining = code.trim();
  const blocks: ScriptBlock[] = [];

  while (remaining.length > 0) {
    // Strip leading whitespace, newlines, and loose semicolons
    remaining = remaining.replace(/^[\s\r\n;]+/, '');
    if (!remaining) break;

    let match: RegExpMatchArray | null = null;

    // State Variables: change_state_var (this.state.x += delta;)
    match = remaining.match(/^(?:this\.)?state\.([a-zA-Z0-9_$]+)\s*\+=\s*(-?\d+(?:\.\d+)?);?/i);
    if (match) {
      blocks.push(createBlock('change_state_var', { variable: match[1], delta: Number(match[2]) }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // State Variables: set_state_var (this.state.x = val;)
    match = remaining.match(
      /^(?:this\.)?state\.([a-zA-Z0-9_$]+)\s*=\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`|(-?\d+(?:\.\d+)?|true|false));?/i
    );
    if (match) {
      const val = match[2] ?? match[3] ?? match[4] ?? match[5];
      blocks.push(createBlock('set_state_var', { variable: match[1], value: val }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Events: on_custom_event (this.on('event', () => { ... }))
    match = remaining.match(
      /^(?:this\.)?on\s*\(\s*(['"`])([^'"]+)\1\s*,\s*(?:\([^\)]*\)\s*=>|function\s*\([^\)]*\))\s*\{/i
    );
    if (match) {
      const openIdx = match[0].length - 1;
      const braces = extractBalancedBraces(remaining, openIdx);
      if (braces) {
        const action = braces.content.trim();
        const actionBlocks = parseJSIntoBlocks(action);
        const afterOn = remaining.slice(braces.endIndex + 1).match(/^\s*\);?/);
        blocks.push(createBlock('on_custom_event', { event: match[2], action, actionBlocks }));
        remaining = remaining.slice(braces.endIndex + 1 + (afterOn ? afterOn[0].length : 0));
        continue;
      }
    }

    // Events: emit_custom_event (this.emit('event', payload);)
    match = remaining.match(/^(?:this\.)?emit\s*\(\s*(['"`])([^'"]+)\1(?:\s*,\s*([\s\S]*?))?\s*\);?/i);
    if (match) {
      blocks.push(createBlock('emit_custom_event', { event: match[2], payload: match[3] ? match[3].trim() : '' }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Spawning: spawn_clip (this.spawnClip('Clip', { x, y });)
    match = remaining.match(
      /^(?:this\.)?spawnClip\s*\(\s*(['"`])([^'"]*)\1(?:\s*,\s*\{\s*(?:x:\s*(-?\d+(?:\.\d+)?))?(?:,?\s*y:\s*(-?\d+(?:\.\d+)?))?\s*\}\s*)?\);?/i
    );
    if (match) {
      const clipName = match[2];
      const x = match[3] !== undefined ? Number(match[3]) : 0;
      const y = match[4] !== undefined ? Number(match[4]) : 0;
      blocks.push(createBlock('spawn_clip', { clipName, x, y }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Particles: emit_particles (this.emitParticles({ preset: 'splat', ... });)
    match = remaining.match(/^(?:this\.)?emitParticles\s*\(\s*\{([\s\S]*?)\}\s*\);?/i);
    if (match) {
      const body = match[1];
      const presetMatch = body.match(/preset:\s*(['"`])([^'"]+)\1/);
      const xMatch = body.match(/x:\s*(-?\d+(?:\.\d+)?)/);
      const yMatch = body.match(/y:\s*(-?\d+(?:\.\d+)?)/);
      const countMatch = body.match(/(?:particleCount|count):\s*(\d+)/);
      blocks.push(
        createBlock('emit_particles', {
          preset: presetMatch ? presetMatch[2] : 'splat',
          x: xMatch ? Number(xMatch[1]) : 0,
          y: yMatch ? Number(yMatch[1]) : 0,
          particleCount: countMatch ? Number(countMatch[1]) : 50,
        })
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Control: if ... else and if ... condition (with balanced braces & recursion)
    match = remaining.match(/^if\s*\(([\s\S]*?)\)\s*\{/i);
    if (match) {
      const cond = match[1].trim();
      const openIdx = match[0].length - 1;
      const thenBraces = extractBalancedBraces(remaining, openIdx);
      if (thenBraces) {
        const thenAction = thenBraces.content.trim();
        const thenBlocks = parseJSIntoBlocks(thenAction);
        const afterThen = remaining.slice(thenBraces.endIndex + 1);
        const elseMatch = afterThen.match(/^\s*else\s*\{/i);

        if (elseMatch) {
          const elseOpenIdx = elseMatch[0].length - 1;
          const elseBraces = extractBalancedBraces(afterThen, elseOpenIdx);
          if (elseBraces) {
            const elseAction = elseBraces.content.trim();
            const elseBlocks = parseJSIntoBlocks(elseAction);
            const afterElse = afterThen.slice(elseBraces.endIndex + 1).match(/^\s*;?/);
            blocks.push(
              createBlock('if_else', {
                condition: cond,
                thenAction,
                thenBlocks,
                elseAction,
                elseBlocks,
              })
            );
            remaining = remaining.slice(
              thenBraces.endIndex + 1 + elseBraces.endIndex + 1 + (afterElse ? afterElse[0].length : 0)
            );
            continue;
          }
        }

        // Single if condition
        const afterIf = afterThen.match(/^\s*;?/);
        blocks.push(
          createBlock('if_condition', {
            condition: cond,
            thenAction,
            thenBlocks,
          })
        );
        remaining = remaining.slice(thenBraces.endIndex + 1 + (afterIf ? afterIf[0].length : 0));
        continue;
      }
    }

    // Control: do_while (do { ... } while (cond);)
    match = remaining.match(/^do\s*\{/i);
    if (match) {
      const openIdx = match[0].length - 1;
      const bodyBraces = extractBalancedBraces(remaining, openIdx);
      if (bodyBraces) {
        const afterDo = remaining.slice(bodyBraces.endIndex + 1);
        const whileSuffix = afterDo.match(/^\s*while\s*\(([\s\S]*?)\);?/i);
        if (whileSuffix) {
          const body = bodyBraces.content.trim();
          const bodyBlocks = parseJSIntoBlocks(body);
          blocks.push(
            createBlock('do_while', {
              condition: whileSuffix[1].trim(),
              body,
              bodyBlocks,
            })
          );
          remaining = remaining.slice(bodyBraces.endIndex + 1 + whileSuffix[0].length);
          continue;
        }
      }
    }

    // Control: while_loop (while (cond) { ... })
    match = remaining.match(/^while\s*\(([\s\S]*?)\)\s*\{/i);
    if (match) {
      const cond = match[1].trim();
      const openIdx = match[0].length - 1;
      const bodyBraces = extractBalancedBraces(remaining, openIdx);
      if (bodyBraces) {
        const body = bodyBraces.content.trim();
        const bodyBlocks = parseJSIntoBlocks(body);
        const afterWhile = remaining.slice(bodyBraces.endIndex + 1).match(/^\s*;?/);
        blocks.push(
          createBlock('while_loop', {
            condition: cond,
            body,
            bodyBlocks,
          })
        );
        remaining = remaining.slice(bodyBraces.endIndex + 1 + (afterWhile ? afterWhile[0].length : 0));
        continue;
      }
    }

    // Control: repeat_times (for (let i = 0; i < N; i++) { ... })
    match = remaining.match(
      /^for\s*\(\s*(?:let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*0;\s*\1\s*<\s*(\d+);\s*\1\s*\+\+\s*\)\s*\{/i
    );
    if (match) {
      const indexVar = match[1];
      const times = Number(match[2]);
      const openIdx = match[0].length - 1;
      const bodyBraces = extractBalancedBraces(remaining, openIdx);
      if (bodyBraces) {
        const body = bodyBraces.content.trim();
        const bodyBlocks = parseJSIntoBlocks(body);
        const afterFor = remaining.slice(bodyBraces.endIndex + 1).match(/^\s*;?/);
        blocks.push(
          createBlock('repeat_times', {
            indexVar,
            times,
            body,
            bodyBlocks,
          })
        );
        remaining = remaining.slice(bodyBraces.endIndex + 1 + (afterFor ? afterFor[0].length : 0));
        continue;
      }
    }

    // Control: for_each (for (const it of arr) { ... })
    match = remaining.match(
      /^for\s*\(\s*(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s+of\s+([^\)]+)\)\s*\{/i
    );
    if (match) {
      const item = match[1];
      const array = match[2].trim();
      const openIdx = match[0].length - 1;
      const bodyBraces = extractBalancedBraces(remaining, openIdx);
      if (bodyBraces) {
        const body = bodyBraces.content.trim();
        const bodyBlocks = parseJSIntoBlocks(body);
        const afterFor = remaining.slice(bodyBraces.endIndex + 1).match(/^\s*;?/);
        blocks.push(
          createBlock('for_each', {
            item,
            array,
            body,
            bodyBlocks,
          })
        );
        remaining = remaining.slice(bodyBraces.endIndex + 1 + (afterFor ? afterFor[0].length : 0));
        continue;
      }
    }

    // Control: switch_case (switch (expr) { ... })
    match = remaining.match(/^switch\s*\(([\s\S]*?)\)\s*\{/i);
    if (match) {
      const expr = match[1].trim();
      const openIdx = match[0].length - 1;
      const bodyBraces = extractBalancedBraces(remaining, openIdx);
      if (bodyBraces) {
        const body = bodyBraces.content;
        const caseMatch = body.match(/case\s+([^:]+):([\s\S]*?)(?:break;|$)/i);
        const defaultMatch = body.match(/default:([\s\S]*?)(?:break;|$)/i);
        const action1 = caseMatch ? caseMatch[2].trim() : 'this.gotoAndPlay(1);';
        const defaultAction = defaultMatch ? defaultMatch[1].trim() : 'this.stop();';
        const afterSwitch = remaining.slice(bodyBraces.endIndex + 1).match(/^\s*;?/);
        blocks.push(
          createBlock('switch_case', {
            expression: expr,
            case1: caseMatch ? caseMatch[1].trim() : '1',
            action1,
            caseBlocks: parseJSIntoBlocks(action1),
            defaultAction,
            defaultBlocks: parseJSIntoBlocks(defaultAction),
          })
        );
        remaining = remaining.slice(bodyBraces.endIndex + 1 + (afterSwitch ? afterSwitch[0].length : 0));
        continue;
      }
    }

    // 1. wait_play: setTimeout(() => { this.play(); }, N);
    match = remaining.match(
      /^setTimeout\s*\(\s*(?:\(\)\s*=>|function\s*\(\)\s*)\s*\{\s*(?:this\.)?play\(\);?\s*\}\s*,\s*(\d+(?:\.\d+)?)\s*\);?/i
    );
    if (match) {
      const ms = Number(match[1]);
      const seconds = Math.round(ms / 100) / 10;
      blocks.push(createBlock('wait_play', { seconds }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 2. alert('...')
    match = remaining.match(/^alert\s*\(\s*(['"`])([\s\S]*?)\1\s*\);?/i);
    if (match) {
      blocks.push(createBlock('alert', { message: match[2] }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 3. console.log('...')
    match = remaining.match(/^console\.log\s*\(\s*(['"`])([\s\S]*?)\1\s*\);?/i);
    if (match) {
      blocks.push(createBlock('console_log', { message: match[2] }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 4. gotoArtboard('id', { type: 'fade', duration: 300 })
    match = remaining.match(
      /^gotoArtboard\s*\(\s*(['"`])([^'"]*)\1(?:\s*,\s*\{\s*type:\s*(['"`])([^'"]+)\3(?:\s*,\s*duration:\s*(\d+))?\s*\}\s*)?\);?/i
    );
    if (match) {
      const artboardId = match[2];
      const transition = match[4] || 'none';
      const duration = match[5] ? Number(match[5]) : 300;
      blocks.push(
        createBlock('goto_artboard', {
          artboardId,
          transition,
          duration,
        })
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 5. window.open('url', '_blank')
    match = remaining.match(
      /^window\.open\s*\(\s*(['"`])([^'"]*)\1(?:\s*,\s*(['"`])([^'"]+)\3)?\s*\);?/i
    );
    if (match) {
      const url = match[2];
      const target = match[4] || '_blank';
      blocks.push(createBlock('open_url', { url, target }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 6. this.stop()
    match = remaining.match(/^(?:this\.)?stop\s*\(\s*\);?/i);
    if (match) {
      blocks.push(createBlock('stop'));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 7. this.play()
    match = remaining.match(/^(?:this\.)?play\s*\(\s*\);?/i);
    if (match) {
      blocks.push(createBlock('play'));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 8. gotoAndPlay(N)
    match = remaining.match(/^(?:this\.)?gotoAndPlay\s*\(\s*(\d+)\s*\);?/i);
    if (match) {
      blocks.push(createBlock('goto_and_play', { frame: Number(match[1]) }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 9. gotoAndStop(N)
    match = remaining.match(/^(?:this\.)?gotoAndStop\s*\(\s*(\d+)\s*\);?/i);
    if (match) {
      blocks.push(createBlock('goto_and_stop', { frame: Number(match[1]) }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 10. nextFrame()
    match = remaining.match(/^(?:this\.)?nextFrame\s*\(\s*\);?/i);
    if (match) {
      blocks.push(createBlock('next_frame'));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 11. prevFrame()
    match = remaining.match(/^(?:this\.)?prevFrame\s*\(\s*\);?/i);
    if (match) {
      blocks.push(createBlock('prev_frame'));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 12. scaleX = s; scaleY = s;
    match = remaining.match(
      /^(?:this\.)?scaleX\s*=\s*(-?\d+(?:\.\d+)?);?\s*(?:this\.)?scaleY\s*=\s*(-?\d+(?:\.\d+)?);?/i
    );
    if (match) {
      const s = Number(match[1]);
      blocks.push(createBlock('set_scale', { percent: Math.round(s * 100) }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 13. move_by: x += dx; y += dy;
    match = remaining.match(
      /^(?:this\.)?x\s*\+=\s*(-?\d+(?:\.\d+)?);?\s*(?:this\.)?y\s*\+=\s*(-?\d+(?:\.\d+)?);?/i
    );
    if (match) {
      blocks.push(
        createBlock('move_by', { dx: Number(match[1]), dy: Number(match[2]) })
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    match = remaining.match(
      /^(?:this\.)?y\s*\+=\s*(-?\d+(?:\.\d+)?);?\s*(?:this\.)?x\s*\+=\s*(-?\d+(?:\.\d+)?);?/i
    );
    if (match) {
      blocks.push(
        createBlock('move_by', { dx: Number(match[2]), dy: Number(match[1]) })
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    match = remaining.match(/^(?:this\.)?x\s*\+=\s*(-?\d+(?:\.\d+)?);?/i);
    if (match) {
      blocks.push(createBlock('move_by', { dx: Number(match[1]), dy: 0 }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    match = remaining.match(/^(?:this\.)?y\s*\+=\s*(-?\d+(?:\.\d+)?);?/i);
    if (match) {
      blocks.push(createBlock('move_by', { dx: 0, dy: Number(match[1]) }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 14. set_position: x = N; y = N;
    match = remaining.match(
      /^(?:this\.)?x\s*=\s*(-?\d+(?:\.\d+)?);?\s*(?:this\.)?y\s*=\s*(-?\d+(?:\.\d+)?);?/i
    );
    if (match) {
      blocks.push(
        createBlock('set_position', { x: Number(match[1]), y: Number(match[2]) })
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    match = remaining.match(
      /^(?:this\.)?y\s*=\s*(-?\d+(?:\.\d+)?);?\s*(?:this\.)?x\s*=\s*(-?\d+(?:\.\d+)?);?/i
    );
    if (match) {
      blocks.push(
        createBlock('set_position', { x: Number(match[2]), y: Number(match[1]) })
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    match = remaining.match(/^(?:this\.)?x\s*=\s*(-?\d+(?:\.\d+)?);?/i);
    if (match) {
      blocks.push(createBlock('set_position', { x: Number(match[1]), y: 0 }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    match = remaining.match(/^(?:this\.)?y\s*=\s*(-?\d+(?:\.\d+)?);?/i);
    if (match) {
      blocks.push(createBlock('set_position', { x: 0, y: Number(match[1]) }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 15. rotate_by: rotation += N
    match = remaining.match(/^(?:this\.)?rotation\s*\+=\s*(-?\d+(?:\.\d+)?);?/i);
    if (match) {
      blocks.push(createBlock('rotate_by', { degrees: Number(match[1]) }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 16. set_rotation: rotation = N
    match = remaining.match(/^(?:this\.)?rotation\s*=\s*(-?\d+(?:\.\d+)?);?/i);
    if (match) {
      blocks.push(createBlock('set_rotation', { degrees: Number(match[1]) }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 17. set_opacity: alpha = N
    match = remaining.match(/^(?:this\.)?alpha\s*=\s*(-?\d+(?:\.\d+)?);?/i);
    if (match) {
      const a = Number(match[1]);
      blocks.push(createBlock('set_opacity', { percent: Math.round(a * 100) }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 18. toggle_visible: visible = !visible
    match = remaining.match(/^(?:this\.)?visible\s*=\s*!(?:this\.)?visible;?/i);
    if (match) {
      blocks.push(createBlock('toggle_visible'));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 19. set_visible: visible = true/false
    match = remaining.match(/^(?:this\.)?visible\s*=\s*(true|false);?/i);
    if (match) {
      blocks.push(createBlock('set_visible', { visible: match[1] === 'true' }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // 20. Unrecognized line/statement -> custom_js block
    const lineEnd = remaining.indexOf('\n');
    let line = lineEnd === -1 ? remaining : remaining.slice(0, lineEnd);
    remaining = lineEnd === -1 ? '' : remaining.slice(lineEnd + 1);

    // If line has unmatched '{', capture until matching '}'
    let openBraces = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    while (openBraces > 0 && remaining.length > 0) {
      const nextLineEnd = remaining.indexOf('\n');
      const nextLine = nextLineEnd === -1 ? remaining : remaining.slice(0, nextLineEnd);
      remaining = nextLineEnd === -1 ? '' : remaining.slice(nextLineEnd + 1);
      line += '\n' + nextLine;
      openBraces += (nextLine.match(/\{/g) || []).length - (nextLine.match(/\}/g) || []).length;
    }

    if (line.trim()) {
      blocks.push(createBlock('custom_js', { code: line.trim() }));
    }
  }

  return blocks;
}
