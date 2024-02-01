import { Signal } from "@preact/signals-react";

/** Waits for a signal value to not be undefined */
export async function firstWhereDefined<T>(
  signal: Signal<T | undefined>
): Promise<T> {
  const result = await firstWhere(signal, (v) => v !== undefined);
  return result!;
}

/** Waits for a signal value to respect a certain condition */
export function firstWhere<T>(
  signal: Signal<T>,
  predicate: (value: T) => boolean
): Promise<T> {
  return new Promise((resolve) => {
    const dispose = signal.subscribe((value) => {
      if (predicate(value)) {
        resolve(value);
        dispose();
      }
    });
  });
}
