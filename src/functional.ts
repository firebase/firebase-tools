/**
 * Flattens an object so that the return value's keys are the path
 * to a value in the source object. E.g. flattenObject({the: {answer: 42}})
 * returns {"the.answser": 42}
 * @param obj An object to be flattened
 * @return An array where values come from obj and keys are the path in obj to that value.
 */
export function* flattenObject(obj: Record<string, unknown>): Generator<[string, unknown]> {
  function* helper(path: string[], obj: Record<string, unknown>): Generator<[string, unknown]> {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "object" || v === null) {
        yield [[...path, k].join("."), v];
      } else {
        // Object.entries loses type info, so we must cast
        yield* helper([...path, k], v as Record<string, unknown>);
      }
    }
  }
  yield* helper([], obj);
}

/**
 * Yields each non-array element recursively in arr.
 * Useful for for-of loops.
 * [...flatten([[[1]], [2], 3])] = [1, 2, 3]
 */
// eslint-disable-next-line  @typescript-eslint/no-explicit-any
export function* flattenArray<T = any>(arr: unknown[]): Generator<T> {
  for (const val of arr) {
    if (Array.isArray(val)) {
      yield* flattenArray(val);
    } else {
      yield val as T;
    }
  }
}

/** Shorthand for flattenObject. */
export function flatten(obj: Record<string, unknown>): Generator<[string, unknown]>;
/** Shorthand for flattenArray. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function flatten<T = any>(arr: unknown[]): Generator<T>;

/** Flattens an object or array. */
export function flatten<T>(
  objOrArr: Record<string, unknown> | unknown[]
): Generator<[string, unknown]> | Generator<T> {
  if (Array.isArray(objOrArr)) {
    return flattenArray<T>(objOrArr);
  } else {
    return flattenObject(objOrArr);
  }
}

/**
 * Used with reduce to flatten in place.
 * Due to the quirks of TypeScript, callers must pass [] as the
 * second argument to reduce.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reduceFlat<T = any>(accum: T[] | undefined, next: unknown): T[] {
  return [...(accum || []), ...flatten<T>([next])];
}

/**
 * Yields each element from left and right in tandem
 * [...zip([1, 2, 3], ['a', 'b', 'c'])] = [[1, 'a], [2, 'b'], [3, 'c']]
 */
export function* zip<T, V>(left: T[], right: V[]): Generator<[T, V]> {
  if (left.length != right.length) {
    throw new Error("Cannot zip between two lists of differen lengths");
  }
  for (let i = 0; i < left.length; i++) {
    yield [left[i], right[i]];
  }
}

/**
 * Utility to zip in another array from map.
 * [1, 2].map(zipIn(['a', 'b'])) = [[1, 'a'], [2, 'b']]
 */
export const zipIn = <T, V>(other: V[]) => (elem: T, ndx: number): [T, V] => {
  return [elem, other[ndx]];
};

/** Used with type guards to guarantee that all cases have been covered. */
export function assertExhaustive(val: never): never {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  throw new Error(`Never has a value (${val}). This should be impossible`);
}

/**
 * Utility to partition an array into two based on callbackFn's truthiness for each element.
 * Returns a Array containing two Array<T>. The first array contains all elements that returned true,
 * the second contains all elements that returned false.
 */
export function partition<T>(arr: T[], callbackFn: (elem: T) => boolean): T[][] {
  return arr.reduce<T[][]>(
    (acc, elem) => {
      acc[callbackFn(elem) ? 0 : 1].push(elem);
      return acc;
    },
    [[], []]
  );
}
