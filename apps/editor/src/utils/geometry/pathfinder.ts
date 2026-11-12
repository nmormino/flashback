import paper from 'paper';

export interface ExpandStrokeOptions {
  cap?: 'round' | 'butt' | 'square';
  join?: 'round' | 'miter' | 'bevel';
  miterLimit?: number;
}

let scopeInstance: paper.PaperScope | null = null;

/**
 * Returns a headless PaperScope instance, initialized with a virtual canvas or size.
 */
export function getGeometryPaperScope(): paper.PaperScope {
  if (!scopeInstance) {
    scopeInstance = new paper.PaperScope();
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const canvas = document.createElement('canvas');
      canvas.width = 4000;
      canvas.height = 4000;
      scopeInstance.setup(canvas);
    } else {
      scopeInstance.setup(new scopeInstance.Size(4000, 4000));
    }
  }
  return scopeInstance;
}

/**
 * Executes a function within the headless PaperScope and clears the active project afterwards.
 */
function withPaperScope<T>(fn: (scope: paper.PaperScope) => T): T {
  const scope = getGeometryPaperScope();
  scope.activate();
  try {
    return fn(scope);
  } finally {
    try {
      scope.project?.clear();
    } catch {
      // ignore clear errors
    }
  }
}

/**
 * Extracts clean SVG path data string from a Paper.js Item.
 */
export function extractPathData(item: paper.Item | null | undefined): string {
  if (!item) return '';

  const directD = (item as any).pathData;
  if (typeof directD === 'string' && directD.trim().length > 0) {
    return directD.trim();
  }

  try {
    if (typeof (item as any).exportSVG === 'function') {
      const exported = (item as any).exportSVG({ asString: false }) as SVGElement;
      if (exported) {
        if (typeof exported.getAttribute === 'function') {
          const d = exported.getAttribute('d');
          if (d) return d.trim();
        }
        if (typeof exported.querySelector === 'function') {
          const pathEl = exported.querySelector('path');
          const d = pathEl?.getAttribute('d');
          if (d) return d.trim();
        }
      }
    }
  } catch {
    // fallback if DOM/exportSVG not supported
  }

  return '';
}

/**
 * Combines two SVG paths into a single unified perimeter (Boolean Union).
 */
export function unitePaths(pathData1: string, pathData2: string): string {
  const p1 = (pathData1 || '').trim();
  const p2 = (pathData2 || '').trim();

  if (!p1) return p2;
  if (!p2) return p1;

  try {
    return withPaperScope((scope) => {
      const item1 = new scope.CompoundPath(p1);
      const item2 = new scope.CompoundPath(p2);
      const united = item1.unite(item2);
      return extractPathData(united) || `${p1} ${p2}`;
    });
  } catch {
    return `${p1} ${p2}`;
  }
}

/**
 * Subtracts the second path from the first base path (Boolean Minus Front / Difference).
 */
export function subtractPaths(basePathData: string, subtractPathData: string): string {
  const base = (basePathData || '').trim();
  const sub = (subtractPathData || '').trim();

  if (!base) return '';
  if (!sub) return base;

  try {
    return withPaperScope((scope) => {
      const baseItem = new scope.CompoundPath(base);
      const subItem = new scope.CompoundPath(sub);
      const result = baseItem.subtract(subItem);
      return extractPathData(result);
    });
  } catch {
    return base;
  }
}

/**
 * Returns only the overlapping area between two SVG paths (Boolean Intersect).
 */
export function intersectPaths(pathData1: string, pathData2: string): string {
  const p1 = (pathData1 || '').trim();
  const p2 = (pathData2 || '').trim();

  if (!p1 || !p2) return '';

  try {
    return withPaperScope((scope) => {
      const item1 = new scope.CompoundPath(p1);
      const item2 = new scope.CompoundPath(p2);
      const result = item1.intersect(item2);
      return extractPathData(result);
    });
  } catch {
    return '';
  }
}

/**
 * Returns regions where either path is present, but excludes the intersection (Boolean XOR / Exclude).
 */
export function excludePaths(pathData1: string, pathData2: string): string {
  const p1 = (pathData1 || '').trim();
  const p2 = (pathData2 || '').trim();

  if (!p1) return p2;
  if (!p2) return p1;

  try {
    return withPaperScope((scope) => {
      const item1 = new scope.CompoundPath(p1);
      const item2 = new scope.CompoundPath(p2);
      const result = item1.exclude(item2);
      return extractPathData(result) || `${p1} ${p2}`;
    });
  } catch {
    return `${p1} ${p2}`;
  }
}

/**
 * Expands an open or closed stroked path into a filled outline polygon (Outline Stroke).
 */
export function expandStroke(
  pathData: string,
  strokeWidth: number,
  options?: ExpandStrokeOptions
): string {
  const d = (pathData || '').trim();
  if (!d) return '';
  if (strokeWidth <= 0) return d;

  try {
    return withPaperScope((scope) => {
      const item = new scope.CompoundPath(d);
      const outlined = (item as any).outline({
        width: strokeWidth,
        cap: options?.cap,
        join: options?.join,
        miterLimit: options?.miterLimit,
      });
      return extractPathData(outlined) || d;
    });
  } catch {
    return d;
  }
}
