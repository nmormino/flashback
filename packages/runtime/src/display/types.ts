import type { StageAPI, MovieClipContext } from '../schema';
import type { DisplayObject } from './DisplayObject';

export interface RendererHooks {
  onTransformChange?(target: DisplayObject): void;
  onAlphaChange?(target: DisplayObject): void;
  onVisibleChange?(target: DisplayObject): void;
  onFiltersChange?(target: DisplayObject): void;
  onColorTransformChange?(target: DisplayObject): void;
  onChildAdded?(parent: DisplayObject, child: DisplayObject): void;
  onChildRemoved?(parent: DisplayObject, child: DisplayObject): void;
  onDestroy?(target: DisplayObject): void;
}

export class HeadlessStage implements StageAPI {
  public width: number;
  public height: number;
  public fps: number;
  public mouseX = 0;
  public mouseY = 0;
  public readonly global: Record<string, unknown> = {};
  private keysDown = new Set<string>();

  constructor(width = 550, height = 400, fps = 24) {
    this.width = width;
    this.height = height;
    this.fps = fps;
  }

  public isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  public setKeyDown(code: string, down: boolean): void {
    if (down) {
      this.keysDown.add(code);
    } else {
      this.keysDown.delete(code);
    }
  }

  public setMousePosition(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
  }
}
