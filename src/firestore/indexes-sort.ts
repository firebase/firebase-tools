import * as API from "./indexes-api";
import * as Spec from "./indexes-spec";
import * as util from "./util";

/**
 * Compare two Index spec entries for sorting.
 *
 * Comparisons:
 *   1) The collection group.
 *   2) The query scope.
 *   3) The fields list.
 */
export function compareSpecIndex(a: Spec.Index, b: Spec.Index): number {
  if (a.collectionGroup !== b.collectionGroup) {
    return a.collectionGroup.localeCompare(b.collectionGroup);
  }

  if (a.queryScope !== b.queryScope) {
    return compareQueryScope(a.queryScope, b.queryScope);
  }

  return compareArrays(a.fields, b.fields, compareIndexField);
}

/**
 * Compare two Index api entries for sorting.
 *
 * Comparisons:
 *   1) The collection group.
 *   2) The query scope.
 *   3) The fields list.
 */
export function compareApiIndex(a: API.Index, b: API.Index): number {
  const aName = util.parseIndexName(a.name);
  const bName = util.parseIndexName(b.name);

  if (aName.collectionGroupId !== bName.collectionGroupId) {
    return aName.collectionGroupId.localeCompare(bName.collectionGroupId);
  }

  if (a.queryScope !== b.queryScope) {
    return compareQueryScope(a.queryScope, b.queryScope);
  }

  return compareArrays(a.fields, b.fields, compareIndexField);
}

/**
 * Compare two Field api entries for sorting.
 *
 * Comparisons:
 *   1) The collection group.
 *   2) The field path.
 *   3) The indexes list in the config.
 */
export function compareApiField(a: API.Field, b: API.Field): number {
  const aName = util.parseFieldName(a.name);
  const bName = util.parseFieldName(b.name);

  if (aName.collectionGroupId !== bName.collectionGroupId) {
    return aName.collectionGroupId.localeCompare(bName.collectionGroupId);
  }

  if (aName.fieldPath !== bName.fieldPath) {
    return aName.fieldPath.localeCompare(bName.fieldPath);
  }

  return compareArrays(a.indexConfig.indexes || [], b.indexConfig.indexes || [], compareApiIndex);
}

/**
 * Compare two Field override specs for sorting.
 *
 * Comparisons:
 *   1) The collection group.
 *   2) The field path.
 *   3) The list of indexes.
 */
export function compareFieldOverride(a: Spec.FieldOverride, b: Spec.FieldOverride): number {
  if (a.collectionGroup !== b.collectionGroup) {
    return a.collectionGroup.localeCompare(b.collectionGroup);
  }

  if (a.fieldPath !== b.fieldPath) {
    return a.fieldPath.localeCompare(b.fieldPath);
  }

  return compareArrays(a.indexes, b.indexes, compareFieldIndex);
}

/**
 * Compare two IndexField objects.
 *
 * Comparisons:
 *   1) Field path.
 *   2) Sort order (if it exists).
 *   3) Array config (if it exists).
 */
function compareIndexField(a: API.IndexField, b: API.IndexField): number {
  if (a.fieldPath !== b.fieldPath) {
    return a.fieldPath.localeCompare(b.fieldPath);
  }

  if (a.order !== b.order) {
    return compareOrder(a.order, b.order);
  }

  if (a.arrayConfig !== b.arrayConfig) {
    return compareArrayConfig(a.arrayConfig, b.arrayConfig);
  }

  return 0;
}

function compareFieldIndex(a: Spec.FieldIndex, b: Spec.FieldIndex): number {
  if (a.queryScope !== b.queryScope) {
    return compareQueryScope(a.queryScope, b.queryScope);
  }

  if (a.order !== b.order) {
    return compareOrder(a.order, b.order);
  }

  if (a.arrayConfig !== b.arrayConfig) {
    return compareArrayConfig(a.arrayConfig, b.arrayConfig);
  }

  return 0;
}

function compareQueryScope(a: API.QueryScope, b: API.QueryScope): number {
  const sequence = [API.QueryScope.COLLECTION_GROUP, API.QueryScope.COLLECTION, undefined];

  return sequence.indexOf(a) - sequence.indexOf(b);
}

function compareOrder(a?: API.Order, b?: API.Order): number {
  const sequence = [API.Order.ASCENDING, API.Order.DESCENDING, undefined];

  return sequence.indexOf(a) - sequence.indexOf(b);
}

function compareArrayConfig(a?: API.ArrayConfig, b?: API.ArrayConfig): number {
  const sequence = [API.ArrayConfig.CONTAINS, undefined];

  return sequence.indexOf(a) - sequence.indexOf(b);
}

/**
 * Compare two arrays of objects by first sorting each array, then
 * looking for the first non-equal element and comparing them.
 *
 * If the shorter array is a perfect prefix of the longer array,
 * then the shorter array is sorted first.
 */
function compareArrays<T>(a: T[], b: T[], fn: (x: T, y: T) => number): number {
  const aSorted = a.sort(fn);
  const bSorted = b.sort(fn);

  const minFields = Math.min(aSorted.length, bSorted.length);
  for (let i = 0; i < minFields; i++) {
    const cmp = fn(aSorted[i], bSorted[i]);
    if (cmp !== 0) {
      return cmp;
    }
  }

  return aSorted.length - bSorted.length;
}
