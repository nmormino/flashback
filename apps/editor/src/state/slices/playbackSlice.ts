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
  const executedKfScriptsMap = new Map<string, number>();

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
      let isFirstTick = true;

      const tick = (now: number) => {
        const currentState = context.getState();
        if (!currentState.isPlaying) return;
        const dt = Math.min(0.1, Math.max(0.001, (now - lastRafTime) / 1000));
        lastRafTime = now;

        const activeTl = context.getActiveTimeline(currentState.doc, currentState.isolationStack);
        const fps = currentState.doc.stage.fps || 24;
        const totalDuration = context.computeTotalTimelineDuration(activeTl, fps);
        const prevTime = currentState.currentTime;
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

        const actions = context.getActions();
        actions.executeKeyframeScriptsInRange(prevTime, nextTime, isFirstTick);
        isFirstTick = false;

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
      executedKfScriptsMap.clear();
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

    setScriptTriggerFocus(focus: 'auto' | 'keyframe' | 'element'): void {
      context.setState({ scriptTriggerFocus: focus });
    },

    setLiveKeyframeScriptsEnabled(enabled: boolean): void {
      context.setState({ liveKeyframeScriptsEnabled: enabled });
    },

    openKeyframeScript(layerId: string, frameIndexOrTime: number, isTime?: boolean): void {
      const state = context.getState();
      const tl = context.getActiveTimeline(state.doc, state.isolationStack);
      const layer = tl.layers.find((l) => l.id === layerId);
      if (!layer) return;

      const fps = state.doc.stage.fps || 24;
      let kf: EditorKeyframe | undefined;
      if (isTime) {
        kf =
          context.findKeyframeAtTime(layer, frameIndexOrTime, fps) ??
          layer.keyframes.find((k) => Math.abs(context.getKeyframeTime(k, fps) - frameIndexOrTime) < 0.05);
      } else {
        kf =
          context.findKeyframeAt(layer, frameIndexOrTime) ??
          layer.keyframes.find((k) => k.index === frameIndexOrTime);
      }

      const kfTime = kf
        ? context.getKeyframeTime(kf, fps)
        : isTime
        ? frameIndexOrTime
        : frameIndexOrTime / fps;
      const kfFrame = kf
        ? kf.index
        : isTime
        ? Math.round(frameIndexOrTime * fps)
        : frameIndexOrTime;

      context.setState({
        selectedLayerId: layerId,
        selectedElementIds: [],
        currentFrame: kfFrame,
        currentTime: kfTime,
        selectedFrameIndex: kfFrame,
        selectedTime: kfTime,
        scriptTriggerFocus: 'keyframe',
        activeInspectorTab: 'scripts',
      });
    },

    executeKeyframeScriptsInRange(
      prevTime: number,
      nextTime: number,
      includeZeroStart?: boolean
    ): void {
      const state = context.getState();
      if (!state.liveKeyframeScriptsEnabled) return;

      const tl = context.getActiveTimeline(state.doc, state.isolationStack);
      const fps = state.doc.stage.fps || 24;

      for (const layer of tl.layers) {
        for (const kf of layer.keyframes) {
          const fnObj = kf.actions as { __fn?: string } | undefined;
          const code = fnObj?.__fn;
          if (!code || typeof code !== 'string' || !code.trim()) continue;

          const kfTime = context.getKeyframeTime(kf, fps);
          let triggered = false;

          if (includeZeroStart && prevTime === 0 && Math.abs(kfTime) < 0.001) {
            triggered = true;
          } else if (
            nextTime > prevTime &&
            kfTime > prevTime + 0.0001 &&
            kfTime <= nextTime + 0.0001
          ) {
            triggered = true;
          } else if (nextTime < prevTime && Math.abs(kfTime) <= nextTime + 0.0001) {
            triggered = true;
          }

          if (triggered) {
            const scriptKey = `${kf.id}_${kfTime.toFixed(4)}`;
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (
              executedKfScriptsMap.has(scriptKey) &&
              now - executedKfScriptsMap.get(scriptKey)! < 50
            ) {
              continue;
            }
            executedKfScriptsMap.set(scriptKey, now);

            try {
              const actions = context.getActions();
              const ctx: any = {
                stop: () => actions.setPlaying(false),
                play: () => actions.setPlaying(true),
                gotoAndStop: (f: number) => {
                  actions.setPlaying(false);
                  actions.setCurrentFrame(Math.max(0, Number(f) - 1));
                },
                gotoAndPlay: (f: number) => {
                  actions.setCurrentFrame(Math.max(0, Number(f) - 1));
                  actions.setPlaying(true);
                },
              };

              const gotoArtboard = (idOrName: string) => {
                const doc = context.getState().doc;
                const ab = doc.artboards?.find(
                  (a) => a.id === idOrName || a.name === idOrName
                );
                if (ab) actions.switchArtboard(ab.id);
              };

              const safeAlert = (msg?: any) => {
                if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                  window.alert(String(msg ?? ''));
                } else if (typeof console !== 'undefined' && console.log) {
                  console.log('[Keyframe Script Alert]', msg);
                }
              };

              const safeConsole =
                typeof console !== 'undefined'
                  ? console
                  : {
                      log: () => {},
                      warn: () => {},
                      error: () => {},
                    };

              let cleanCode = code.trim();
              const fnMatch = cleanCode.match(
                /^function\s*(?:[a-zA-Z_$][\w$]*)?\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/
              );
              if (fnMatch) {
                cleanCode = fnMatch[2];
              }

              const runner = new Function(
                'gotoArtboard',
                'alert',
                'console',
                'stop',
                'play',
                'gotoAndStop',
                'gotoAndPlay',
                cleanCode
              );
              runner.call(
                ctx,
                gotoArtboard,
                safeAlert,
                safeConsole,
                ctx.stop,
                ctx.play,
                ctx.gotoAndStop,
                ctx.gotoAndPlay
              );
            } catch (err) {
              console.warn('[Keyframe Script Error]', err);
            }
          }
        }
      }
    },
  };

  return slice;
};
