"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalValueMatches = exports.nullsafeVisitor = exports.mapObject = exports.partitionRecord = exports.partition = exports.assertExhaustive = exports.zipIn = exports.zip = exports.reduceFlat = exports.flatten = exports.flattenArray = exports.flattenObject = void 0;
/**
 * Flattens an object so that the return value's keys are the path
 * to a value in the source object. E.g. flattenObject({the: {answer: 42}})
 * returns {"the.answser": 42}
 * @param obj An object to be flattened
 * @return An array where values come from obj and keys are the path in obj to that value.
 */
function* flattenObject(obj) {
    function* helper(path, obj) {
        for (const [k, v] of Object.entries(obj)) {
            if (typeof v !== "object" || v === null) {
                yield [[...path, k].join("."), v];
            }
            else {
                // Object.entries loses type info, so we must cast
                yield* helper([...path, k], v);
            }
        }
    }
    yield* helper([], obj);
}
exports.flattenObject = flattenObject;
/**
 * Yields each non-array element recursively in arr.
 * Useful for for-of loops.
 * [...flatten([[[1]], [2], 3])] = [1, 2, 3]
 */
// eslint-disable-next-line  @typescript-eslint/no-explicit-any
function* flattenArray(arr) {
    for (const val of arr) {
        if (Array.isArray(val)) {
            yield* flattenArray(val);
        }
        else {
            yield val;
        }
    }
}
exports.flattenArray = flattenArray;
/** Flattens an object or array. */
function flatten(objOrArr) {
    if (Array.isArray(objOrArr)) {
        return flattenArray(objOrArr);
    }
    else {
        return flattenObject(objOrArr);
    }
}
exports.flatten = flatten;
/**
 * Used with reduce to flatten in place.
 * Due to the quirks of TypeScript, callers must pass [] as the
 * second argument to reduce.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reduceFlat(accum, next) {
    return [...(accum || []), ...flatten([next])];
}
exports.reduceFlat = reduceFlat;
/**
 * Yields each element from left and right in tandem
 * [...zip([1, 2, 3], ['a', 'b', 'c'])] = [[1, 'a], [2, 'b'], [3, 'c']]
 */
function* zip(left, right) {
    if (left.length !== right.length) {
        throw new Error("Cannot zip between two lists of differen lengths");
    }
    for (let i = 0; i < left.length; i++) {
        yield [left[i], right[i]];
    }
}
exports.zip = zip;
/**
 * Utility to zip in another array from map.
 * [1, 2].map(zipIn(['a', 'b'])) = [[1, 'a'], [2, 'b']]
 */
const zipIn = (other) => (elem, ndx) => {
    return [elem, other[ndx]];
};
exports.zipIn = zipIn;
/** Used with type guards to guarantee that all cases have been covered. */
function assertExhaustive(val, message) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(message || `Never has a value (${val}).`);
}
exports.assertExhaustive = assertExhaustive;
/**
 * Utility to partition an array into two based on predicate's truthiness for each element.
 * Returns a Array containing two Array<T>. The first array contains all elements that returned true,
 * the second contains all elements that returned false.
 */
function partition(arr, predicate) {
    return arr.reduce((acc, elem) => {
        acc[predicate(elem) ? 0 : 1].push(elem);
        return acc;
    }, [[], []]);
}
exports.partition = partition;
/**
 * Utility to partition a Record into two based on predicate's truthiness for each element.
 * Returns a Array containing two Record<string, T>. The first array contains all elements that returned true,
 * the second contains all elements that returned false.
 */
function partitionRecord(rec, predicate) {
    return Object.entries(rec).reduce((acc, [key, val]) => {
        acc[predicate(key, val) ? 0 : 1][key] = val;
        return acc;
    }, [{}, {}]);
}
exports.partitionRecord = partitionRecord;
/**
 * Create a map of transformed values for all keys.
 */
function mapObject(input, transform) {
    const result = {};
    for (const [k, v] of Object.entries(input)) {
        result[k] = transform(v);
    }
    return result;
}
exports.mapObject = mapObject;
const nullsafeVisitor = (func, ...rest) => (first) => {
    if (first === null) {
        return null;
    }
    return func(first, ...rest);
};
exports.nullsafeVisitor = nullsafeVisitor;
/**
 * Returns true if the given values match. If either one is undefined, the default value is used for comparison.
 * @param lhs the first value.
 * @param rhs the second value.
 * @param defaultValue the value to use if either input is undefined.
 */
function optionalValueMatches(lhs, rhs, defaultValue) {
    lhs = lhs === undefined ? defaultValue : lhs;
    rhs = rhs === undefined ? defaultValue : rhs;
    return lhs === rhs;
}
exports.optionalValueMatches = optionalValueMatches;
//# sourceMappingURL=functional.js.map