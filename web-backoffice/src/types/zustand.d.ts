declare module 'zustand' {
  type StateCreator<T> = (
    set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void,
    get: () => T,
    api: any
  ) => T;

  interface UseBoundStore<T> {
    (): T;
    <U>(selector: (state: T) => U): U;
    getState: () => T;
  }

  export function create<T>(initializer: StateCreator<T>): UseBoundStore<T>;
}
