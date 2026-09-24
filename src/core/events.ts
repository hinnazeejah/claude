/** Tiny typed event bus. Modules talk through events so they stay decoupled. */
type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, h: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(h as Handler<never>);
    return () => set!.delete(h as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    this.handlers.get(type)?.forEach(h => (h as Handler<E[K]>)(payload));
  }
}

export type Lang = 'en' | 'ja';

/** All simulator events. Extended milestone by milestone. */
export interface SimEvents {
  lang: Lang;
  start: { demo: boolean };
  'view:magnification': number;
  'view:labels': boolean;
  'anatomy:opening': number;
}

export const bus = new EventBus<SimEvents>();
