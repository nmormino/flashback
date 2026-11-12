import type { EditorKeyframe } from './types';
import type { PlaybackSliceActions, SliceContext, SliceCreator } from './types';
import { fastClone } from './historySlice';

export const createPlaybackSlice: SliceCreator<PlaybackSliceActions> = (
  context: SliceContext
): PlaybackSliceActions => {
  let tickerTimer: ReturnType<typeof setInterval> | null = null;
  let rafTimer: any = null;
  let lastRafTime = 0;
  let lastCustomLoopCount = 1;

  const slice: PlaybackSliceActions = {
    setLoopMode(mode: 'infinite' | number): void {
      let normalized: 'infinite' | number = mode;
      if ((mode as any) === 'once' || (mode as any) === '1x') {
        normalized = 1;
      } else if ((mode as any) === '3x') {
        normalized = 3;
      } else if (typeof mode === 'number') {
        normalized = Math.max(1, Math.floor(mode));
      }
      if (typeof normalized === 'number') {
        lastCustomLoopCount = normalized;
      }
      context.setState({ loopMode: normalized });
    },

    toggleLoopMode(): void {
      const state = context.getState();
      if (state.loopMode === 'infinite') {
        context.setState({ loopMode: lastCustomLoopCount || 1 });
      } else {
        lastCustomLoopCount = state.loopMode;
        context.setState({ loopMode: 'infinite' });
      }
    },

    setPlayhead(frame: number): void {
      const state = context.getState();
      const activeTl = context.getActiveTimeline(state.doc, state.isolationStack);
      const total = activeTl.frameCount;
      const clamped = Math.max(0, Math.min(frame, Math.max(0, total - 1)));
      const fps = state.doc.stage.fps || 24;
      const time = clamped / fps;
      context.setState({
        currentFrame: clamped,
        selectedFrameIndex: clamped,
        currentTime: time,
        selectedTime: time,
      });
    },

    setPlayheadTime(timeInSeconds: number): void {
      const state = context.getState();
      const clamped = Math.max(0, timeInSeconds);
      const fps = state.doc.stage.fps || 24;
      const frame = Math.round(clamped * fps);
      context.setState({
        currentTime: clamped,
        currentFrame: frame,
        selectedTime: clamped,
        selectedFrameIndex: frame,
      });
    },

    setCurrentFrame(frameIndex: number): void {
      const state = context.getState();
      const fps = state.doc.stage.fps || 24;
      const actions = context.getActions();
      actions.setPlayheadTime(frameIndex / fps);
    },

    setCurrentTime(timeInSeconds: number): void {
      const actions = context.getActions();
      actions.setPlayheadTime(timeInSeconds);
    },

    setPlaying(playing: boolean): void {
      const actions = context.getActions();
      if (playing) {
        actions.play();
      } else {
        actions.stop();
      }
    },

    play(): void {
      const state = context.getState();
      if (state.isPlaying) return;
      context.setState({ isPlaying: true });

      if (rafTimer !== null) {
        if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafTimer);
        else clearTimeout(rafTimer);
        rafTimer = null;
      }
      if (tickerTimer) {
        clearInterval(tickerTimer);
        tickerTimer = null;
      }

      lastRafTime = performance.now();
      let loopCycle = 0;

      const tick = (now: number) => {
        const currentState = context.getState();
        if (!currentState.isPlaying) return;
        const dt = Math.min(0.1, Math.max(0.001, (now - lastRafTime) / 1000));
        lastRafTime = now;

        const activeTl = context.getActiveTimeline(currentState.doc, currentState.isolationStack);
        const fps = currentState.doc.stage.fps || 24;
        const totalDuration = context.computeTotalTimelineDuration(activeTl, fps);
        let nextTime = currentState.currentTime + dt;

        if (nextTime >= totalDuration) {
          loopCycle++;
          if (typeof currentState.loopMode === 'number') {
            if (loopCycle >= currentState.loopMode) {
              const actions = context.getActions();
              actions.stop();
              return;
            }
          }
          nextTime = nextTime % Math.max(0.001, totalDuration);
        }

        const nextFrame = Math.round(nextTime * fps);
        context.setState({
          currentTime: nextTime,
          currentFrame: nextFrame,
          selectedFrameIndex: nextFrame,
          selectedTime: nextTime,
        });

        if (typeof requestAnimationFrame !== 'undefined') {
          rafTimer = requestAnimationFrame(tick);
        } else {
          rafTimer = setTimeout(() => tick(performance.now()), 16) as any;
        }
      };

      if (typeof requestAnimationFrame !== 'undefined') {
        rafTimer = requestAnimationFrame(tick);
      } else {
        rafTimer = setTimeout(() => tick(performance.now()), 16) as any;
      }
    },

    stop(): void {
      if (rafTimer !== null) {
        if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafTimer);
        else clearTimeout(rafTimer);
        rafTimer = null;
      }
      if (tickerTimer) {
        clearInterval(tickerTimer);
        tickerTimer = null;
      }
      const state = context.getState();
      if (state.isPlaying) {
        context.setState({ isPlaying: false });
      }
    },

    togglePlay(): void {
      const actions = context.getActions();
      const state = context.getState();
      if (state.isPlaying) {
        actions.stop();
      } else {
        actions.play();
      }
    },

    rewind(): void {
      const actions = context.getActions();
      actions.stop();
      actions.setPlayheadTime(0);
    },

    stepForward(stepSec = 0.05): void {
      const actions = context.getActions();
      actions.stop();
      const state = context.getState();
      const activeTl = context.getActiveTimeline(state.doc, state.isolationStack);
      const totalDuration = context.computeTotalTimelineDuration(activeTl, state.doc.stage.fps || 24);
      let nextTime = state.currentTime + stepSec;
      if (nextTime >= totalDuration) nextTime = 0;
      actions.setPlayheadTime(nextTime);
    },

    stepBackward(stepSec = 0.05): void {
      const actions = context.getActions();
      actions.stop();
      const state = context.getState();
      const activeTl = context.getActiveTimeline(state.doc, state.isolationStack);
      const totalDuration = context.computeTotalTimelineDuration(activeTl, state.doc.stage.fps || 24);
      let prevTime = state.currentTime - stepSec;
      if (prevTime < 0) prevTime = Math.max(0, totalDuration - stepSec);
      actions.setPlayheadTime(prevTime);
    },

    reverseFrames(layerId?: string): void {
      const state = context.getState();
      const targetLayerId = layerId || state.selectedLayerId;
      if (!targetLayerId) return;
      context.pushHistorySnapshot();
      const doc = fastClone(state.doc);
      const tl = context.getActiveTimeline(doc, state.isolationStack);
      const layer = tl.layers.find((l) => l.id === targetLayerId);
      if (!layer || layer.keyframes.length <= 1) return;
      layer.keyframes.reverse();
      if (context.normalizeLayerKeyframes) {
        context.normalizeLayerKeyframes(layer, doc.stage.fps || 24);
      }
      context.setState({ doc });
    },
  };

  return slice;
};
