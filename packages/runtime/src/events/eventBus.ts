export type EventListenerFn = (payload?: any) => void;

export class EventBus {
  private _listeners = new Map<string, Set<EventListenerFn>>();
  private _hostElement: HTMLElement | null = null;

  public attachHost(host: HTMLElement): void {
    this._hostElement = host;
  }

  public on(eventName: string, handler: EventListenerFn): () => void {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    this._listeners.get(eventName)!.add(handler);

    return () => {
      this.off(eventName, handler);
    };
  }

  public off(eventName: string, handler?: EventListenerFn): void {
    if (!handler) {
      this._listeners.delete(eventName);
      return;
    }
    const set = this._listeners.get(eventName);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this._listeners.delete(eventName);
      }
    }
  }

  public emit(eventName: string, payload?: any): void {
    // 1. Trigger local internal listeners
    const list = this._listeners.get(eventName);
    if (list && list.size > 0) {
      for (const fn of Array.from(list)) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[EventBus] Error in event listener for "${eventName}":`, err);
        }
      }
    }

    // Wildcard listeners if any
    const allList = this._listeners.get('*');
    if (allList && allList.size > 0) {
      for (const fn of Array.from(allList)) {
        try {
          fn({ name: eventName, payload });
        } catch (err) {
          console.error(`[EventBus] Error in wildcard listener for "${eventName}":`, err);
        }
      }
    }

    // 2. Dispatch to host DOM element if attached
    if (this._hostElement && typeof this._hostElement.dispatchEvent === 'function') {
      try {
        // Dispatches generic 'web-anim-event'
        this._hostElement.dispatchEvent(
          new CustomEvent('web-anim-event', {
            detail: { name: eventName, payload },
            bubbles: true,
            composed: true,
          })
        );
        // Also dispatches specific event name for ease of listening
        this._hostElement.dispatchEvent(
          new CustomEvent(eventName, {
            detail: payload,
            bubbles: true,
            composed: true,
          })
        );
      } catch (err) {
        console.warn(`[EventBus] Failed to dispatch DOM CustomEvent for "${eventName}":`, err);
      }
    }
  }

  public clear(): void {
    this._listeners.clear();
  }
}
