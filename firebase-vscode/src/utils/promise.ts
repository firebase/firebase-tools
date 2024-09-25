export function cancelableThen<T>(
  promise: Promise<T>,
  then: (t: T) => void,
): { cancel: () => void } {
  let canceled = false;
  function cancel() {
    canceled = true;
  }

  promise.then((t) => {
    if (!canceled) {
      then(t);
    }
    return t;
  });

  return { cancel };
}
