import type { StateVariable } from '../schema';

export type StateChangeListener = (key: string, value: any, allState: Record<string, any>) => void;

export class StateStore {
  private _values: Record<string, any> = {};
  private _variableDefs = new Map<string, StateVariable>();
  private _listeners = new Set<StateChangeListener>();
  public readonly proxy: Record<string, any>;

  constructor(variables?: StateVariable[], initialValues?: Record<string, any>) {
    if (variables) {
      this.initVariables(variables);
    }
    if (initialValues) {
      this.set(initialValues);
    }

    const self = this;
    this.proxy = new Proxy(this._values, {
      get(_target, prop: string | symbol) {
        if (typeof prop === 'symbol') return Reflect.get(self._values, prop);
        return self.get(prop);
      },
      set(_target, prop: string | symbol, value: any) {
        if (typeof prop === 'symbol') return Reflect.set(self._values, prop, value);
        self.set(prop, value);
        return true;
      },
      has(_target, prop: string | symbol) {
        if (typeof prop === 'symbol') return Reflect.has(self._values, prop);
        return prop in self._values;
      },
      ownKeys() {
        return Reflect.ownKeys(self._values);
      },
      getOwnPropertyDescriptor(_target, prop) {
        return {
          enumerable: true,
          configurable: true,
          value: self.get(prop as string),
          writable: true,
        };
      },
    });
  }

  public initVariables(variables: StateVariable[]): void {
    for (const v of variables) {
      this._variableDefs.set(v.name, v);
      if (!(v.name in this._values)) {
        this._values[v.name] = this.castValue(v.defaultValue, v.type);
      }
    }
  }

  public get(key?: string): any {
    if (!key) {
      return { ...this._values };
    }
    return this._values[key];
  }

  public set(keyOrObject: string | Record<string, any>, value?: any): void {
    if (typeof keyOrObject === 'string') {
      const key = keyOrObject;
      const def = this._variableDefs.get(key);
      const casted = def ? this.castValue(value, def.type) : value;
      const prev = this._values[key];
      if (prev === casted) return;
      this._values[key] = casted;
      this.notify(key, casted);
    } else if (keyOrObject && typeof keyOrObject === 'object') {
      for (const [k, v] of Object.entries(keyOrObject)) {
        const def = this._variableDefs.get(k);
        const casted = def ? this.castValue(v, def.type) : v;
        const prev = this._values[k];
        if (prev !== casted) {
          this._values[k] = casted;
          this.notify(k, casted);
        }
      }
    }
  }

  /**
   * Updates state from external props (e.g. <web-anim state={{ score: 1000 }} />).
   * Overwrites public variables and any unspecified keys.
   */
  public setPublicState(props: Record<string, any>): void {
    if (!props || typeof props !== 'object') return;
    for (const [k, v] of Object.entries(props)) {
      const def = this._variableDefs.get(k);
      // If variable has an explicit isPublic = false, ignore external injection
      if (def && def.isPublic === false) {
        continue;
      }
      this.set(k, v);
    }
  }

  public subscribe(listener: StateChangeListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private notify(key: string, value: any): void {
    const copy = { ...this._values };
    for (const fn of this._listeners) {
      try {
        fn(key, value, copy);
      } catch (err) {
        console.error('[StateStore] Listener error:', err);
      }
    }
  }

  private castValue(val: any, type: string): any {
    if (val === undefined || val === null) {
      switch (type) {
        case 'number':
          return 0;
        case 'string':
          return '';
        case 'boolean':
          return false;
        case 'json':
          return {};
        default:
          return val;
      }
    }

    switch (type) {
      case 'number':
        return Number(val) || 0;
      case 'string':
        return String(val);
      case 'boolean':
        return Boolean(val);
      case 'json':
        if (typeof val === 'string') {
          try {
            return JSON.parse(val);
          } catch {
            return {};
          }
        }
        return val;
      default:
        return val;
    }
  }
}
