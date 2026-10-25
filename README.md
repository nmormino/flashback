# Flashback ⚡️

> An open-source, vector animation studio and runtime for the modern web — combining the expressive timeline and component workflows of classic Flash/Animate with modern web standards (SVG, Web Animations API, and Web Components).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## Overview

**Flashback** is a complete 2D vector animation suite designed for interactive web graphics, games, UI micro-interactions, and expressive animations:

- **Flashback Studio (`apps/editor`)**: A desktop-grade browser studio featuring an interactive Stage, sub-selection bezier path editing, multi-track timeline, keyframe/tween graph, typography controls, and action script editor.
- **Flashback Runtime (`packages/runtime`)**: A zero-dependency, ultra-lightweight hardware-accelerated runtime and custom element (`<web-anim>`) driven by the native Web Animations API (WAAPI) and DOM/SVG.
- **Flashback Serializer (`packages/serializer`)**: Robust document parser, validator, and serializer for `.flashback` / `.json` interchange files.

---

## Features

### 🎨 Vector & Drawing Tools
- **Selection & Sub-selection**: Direct Bézier anchor and control handle manipulation.
- **Shapes & Polygons**: Rectangles, rounded corners, ellipses, star/polygon tools with interactive vertex extrusion.
- **Text on a Path (`<textPath>`)**: Bind and animate text along any Bézier curve with real-time `startOffset` tweening.
- **Box Sizing & Soft Wrapping**: Differentiates between affine scaling and layout-box boundary reflow for multiline typography.
- **Interactive Gradients**: Linear and radial gradient stops with focal point positioning.

### ⏱️ Timeline & Animation
- **Layer & Scene Graph**: Drag-and-drop stacking order reordering, layer folder nesting, isolation modes, and lock/hide controls.
- **Keyframes & Tweens**: Motion tweening, morph shapes, color transforms, alpha/rotation/scale interpolation.
- **Easing Curve Presets**: Linear, ease-in, ease-out, cubic-bezier, spring, bounce, and custom bezier curves.
- **Component & Symbol System**: Encapsulated reusable Components with independent internal timelines and stage instances.

### ⚡️ Runtime Player (`<web-anim>`)
- **Zero-Dependency**: No heavy canvas or WebGL runtimes needed for vector playback.
- **Hardware-Accelerated**: Powered by native SVG and the browser's Web Animations API.
- **Interactive Scripting**: Timeline action triggers (`play()`, `stop()`, `gotoAndPlay()`, `addEventListener`).

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [pnpm](https://pnpm.io/) (v9 or v10)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/noahmormino/flashback.git
cd flashback
pnpm install
```

### Launch the Studio Editor

To start the Flashback Editor locally in development mode:

```bash
pnpm --filter @flashback/editor dev
```

Then open your browser to `http://localhost:5173`.

### Running Tests

Run the full Vitest test suite across all packages (310+ automated tests):

```bash
pnpm -r test
```

### Building for Production

Compile all packages and build the optimized editor bundle:

```bash
pnpm -r build
```

---

## Monorepo Architecture

```
flashback/
├── apps/
│   └── editor/            # React + Vite Studio App
│       ├── src/
│       │   ├── layout/    # Menu bar, workspace docking
│       │   ├── panels/    # Stage, Timeline, Properties, Tools, Scripts, Library
│       │   ├── state/     # Editor store (Zustand) & fast cloning
│       │   └── utils/     # Bezier math, SVG helpers, font parsers
│       └── test/          # Editor & UI integration tests
├── packages/
│   ├── runtime/           # @flashback/runtime
│   │   ├── src/
│   │   │   ├── display/   # DisplayObject & MovieClip tree
│   │   │   ├── player/    # Timeline, Ticker, WAAPI compileTracks, easing
│   │   │   ├── render/    # SVG/DOM renderer, fills, strokes, textPath
│   │   │   └── WebAnim.ts # <web-anim> custom element
│   │   └── test/          # Runtime, math, and rendering tests
│   └── serializer/        # @flashback/serializer
│       ├── src/           # Document schema validation, JSON parser/hydrater
│       └── test/          # Serializer test suite
└── package.json           # Workspace root
```

---

## Embedding in Web Projects

You can embed animations exported from Flashback directly using the custom element:

```html
<script type="module" src="/path/to/runtime.js"></script>

<!-- Embedded Web Component -->
<web-anim src="animation.flashback" autoplay loop></web-anim>
```

Or control it via JavaScript:

```javascript
import { WebAnim } from '@flashback/runtime';

const player = document.querySelector('web-anim');
player.addEventListener('ready', () => {
  player.play();
});
```

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
