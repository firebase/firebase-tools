import { ReadonlySignal, Signal } from "@preact/signals-react";

/** Waits for a signal value to not be undefined */
export async function firstWhereDefined<T>(
  signal: Signal<T | undefined> | ReadonlySignal<T | undefined>,
): Promise<T> {
  const result = await firstWhere(signal, (v) => v !== undefined);
  return result!;
}

/** Waits for a signal value to respect a certain condition */
export function firstWhere<T>(
  signal: Signal<T> | ReadonlySignal<T>,
  predicate: (value: T) => boolean,
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

/** Calls a callback when the signal value changes.
 *
 * This will not call the callback immediately, but only after the value changes.
 */
export function onChange<T>(
  signal: Signal<T>,
  callback: (previous: T, value: T) => void,
): () => void {
  var previous: { value: T } | undefined = undefined;

  return signal.subscribe((value) => {
    // Updating "previous" before calling the callback,
    // to handle cases where the callback throws an error.
    const previousValue = previous;
    previous = { value };

    if (previousValue) {
      callback(previousValue.value, value);
    }
  });
}
