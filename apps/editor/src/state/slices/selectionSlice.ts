import type { SelectionSliceActions, SliceContext, SliceCreator } from './types';

export const createSelectionSlice: SliceCreator<SelectionSliceActions> = (
  context: SliceContext
): SelectionSliceActions => {
  return {
    selectLayer(layerId: string, preserveElementSelection = false): void {
      const state = context.getState();
      const activeTl = context.getActiveTimeline(state.doc, state.isolationStack);
      const targetLayer = activeTl.layers.find((l) => l.id === layerId);
      const hasElementInLayer = targetLayer
        ? targetLayer.keyframes.some((kf) =>
            kf.elements.some((el) => state.selectedElementIds.includes(el.id))
          )
        : false;

      const shouldClear = !preserveElementSelection && !hasElementInLayer;
      context.setState({
        selectedLayerId: layerId,
        selectedElementIds: shouldClear ? [] : state.selectedElementIds,
      });
    },

    setSelectedFrame(layerId: string, frameIndexOrTime: number): void {
      const state = context.getState();
      const fps = state.doc.stage.fps || 24;
      const isSeconds = frameIndexOrTime < 30 && !Number.isInteger(frameIndexOrTime);
      const time = isSeconds ? frameIndexOrTime : frameIndexOrTime / fps;
      const frame = isSeconds ? Math.round(frameIndexOrTime * fps) : frameIndexOrTime;
      context.setState({
        selectedLayerId: layerId,
        selectedFrameIndex: frame,
        currentFrame: frame,
        selectedTime: time,
        currentTime: time,
      });
    },

    setSelectedTime(layerId: string, time: number): void {
      const state = context.getState();
      const fps = state.doc.stage.fps || 24;
      const frame = Math.round(time * fps);
      context.setState({
        selectedLayerId: layerId,
        currentTime: time,
        currentFrame: frame,
        selectedTime: time,
        selectedFrameIndex: frame,
      });
    },

    selectElement(elementId: string, multiSelect = false): void {
      const state = context.getState();
      const activeTl = context.getActiveTimeline(state.doc, state.isolationStack);
      const owningLayer = activeTl.layers.find((l) =>
        l.keyframes.some((kf) => kf.elements.some((el) => el.id === elementId))
      );
      const nextLayerId = owningLayer ? owningLayer.id : state.selectedLayerId;

      if (multiSelect) {
        const exists = state.selectedElementIds.includes(elementId);
        const next = exists
          ? state.selectedElementIds.filter((id) => id !== elementId)
          : [...state.selectedElementIds, elementId];
        context.setState({
          selectedElementIds: next,
          selectedLayerId: nextLayerId,
        });
      } else {
        context.setState({
          selectedElementIds: [elementId],
          selectedLayerId: nextLayerId,
        });
      }
    },

    selectElements(elementIds: string[]): void {
      const state = context.getState();
      const activeTl = context.getActiveTimeline(state.doc, state.isolationStack);
      let nextLayerId = state.selectedLayerId;
      const firstId = elementIds[0];
      if (firstId) {
        const owningLayer = activeTl.layers.find((l) =>
          l.keyframes.some((kf) => kf.elements.some((el) => el.id === firstId))
        );
        if (owningLayer) {
          nextLayerId = owningLayer.id;
        }
      }
      context.setState({
        selectedElementIds: elementIds,
        selectedLayerId: nextLayerId,
      });
    },

    deselectAll(): void {
      const state = context.getState();
      if (state.selectedElementIds.length > 0) {
        context.setState({ selectedElementIds: [] });
      }
    },

    selectAll(): void {
      const state = context.getState();
      const tl = context.getActiveTimeline(state.doc, state.isolationStack);
      const allIds: string[] = [];
      for (const layer of tl.layers) {
        if (!layer.visible) continue;
        const kf =
          context.findKeyframeAtTime(layer, state.currentTime) ??
          context.findKeyframeAt(layer, state.currentFrame);
        if (!kf) continue;
        for (const el of kf.elements) {
          allIds.push(el.id);
        }
      }
      context.setState({ selectedElementIds: allIds });
    },

    setSubselectedAnchor(
      anchor: { shapeId: string; pathIndex: number; anchorIndex: number } | null
    ): void {
      context.setState({ subselectedAnchor: anchor });
    },

    setEditingTextElId(id: string | null): void {
      const state = context.getState();
      if (state.editingTextElId !== id) {
        context.setState({
          editingTextElId: id,
          textSelection: id ? state.textSelection : null,
        });
      }
    },

    setTextSelection(
      selection: { elementId: string; start: number; end: number } | null
    ): void {
      context.setState({ textSelection: selection });
    },
  };
};
