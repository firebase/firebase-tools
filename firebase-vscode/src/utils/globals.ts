// Various utilities to make globals testable.
// This is a workaround. Ideally, we would not use globals at all.

import { Signal, signal } from "@preact/signals-react";

const globals: Array<GlobalSignal<unknown>> = [];

export function resetGlobals() {
  globals.forEach((g) => g.reset());
}

export interface GlobalSignal<T> extends Signal<T> {
  reset(): void;
}

export function globalSignal<T>(initialData: T): GlobalSignal<T> {
  const s: any = signal(initialData);

  s.reset = () => {
    s.value = initialData;
  };

  // TODO: Track globals only in test mode
  globals.push(s as GlobalSignal<T>);

  return s as GlobalSignal<T>;
}
