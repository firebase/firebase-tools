export function cancelableThen<T>(
  promise: Promise<T>,
  then: (t: T) => void,
  onError: (e: unknown) => void,
): { cancel: () => void } {
  let canceled = false;
  function cancel() {
    canceled = true;
  }

  promise.then(
    (t) => {
      if (!canceled) {
        then(t);
      }
      return t;
    },
    (e) => {
      if (!canceled) {
        onError(e);
      }
      return e;
    },
  );

  return { cancel };
}
