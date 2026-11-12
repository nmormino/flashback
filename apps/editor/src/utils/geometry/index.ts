export {
  unitePaths,
  subtractPaths,
  intersectPaths,
  excludePaths,
  expandStroke,
  extractPathData,
  getGeometryPaperScope,
  type ExpandStrokeOptions,
} from './pathfinder';

export {
  fitPointsToCurve,
  type Point2D,
  type FitCurveOptions,
} from './pencilFitter';

export {
  splitCubicBezier,
  getPreciseCurveBounds,
  findClosestPointOnCurve,
  type CurveBounds,
  type ClosestPointResult,
  type SplitCubicResult,
} from './curveMath';

export {
  convertTextToVectorPath,
  getStandardFallbackFontBuffer,
  type TextToVectorOptions,
} from './textOutlines';
