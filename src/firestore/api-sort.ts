import * as API from "./api-types";
import * as Spec from "./api-spec";
import * as util from "./util";

const QUERY_SCOPE_SEQUENCE = [
  API.QueryScope.COLLECTION_GROUP,
  API.QueryScope.COLLECTION,
  undefined,
];

const ORDER_SEQUENCE = [API.Order.ASCENDING, API.Order.DESCENDING, undefined];

const ARRAY_CONFIG_SEQUENCE = [API.ArrayConfig.CONTAINS, undefined];

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
  // When these indexes are used as part of a field override, the name is
  // not always present or relevant.
  if (a.name && b.name) {
    const aName = util.parseIndexName(a.name);
    const bName = util.parseIndexName(b.name);

    if (aName.collectionGroupId !== bName.collectionGroupId) {
      return aName.collectionGroupId.localeCompare(bName.collectionGroupId);
    }
  }

  if (a.queryScope !== b.queryScope) {
    return compareQueryScope(a.queryScope, b.queryScope);
  }

  return compareArrays(a.fields, b.fields, compareIndexField);
}

/**
 * Compare two Database api entries for sorting.
 *
 * Comparisons:
 *   1) The databaseId (name)
 */
export function compareApiDatabase(a: API.DatabaseResp, b: API.DatabaseResp): number {
  // Name should always be unique and present
  return a.name > b.name ? 1 : -1;
}

/**
 * Compare two Location api entries for sorting.
 *
 * Comparisons:
 *   1) The locationId.
 */
export function compareLocation(a: API.Location, b: API.Location): number {
  // LocationId should always be unique and present
  return a.locationId > b.locationId ? 1 : -1;
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

  return compareArraysSorted(
    a.indexConfig.indexes || [],
    b.indexConfig.indexes || [],
    compareApiIndex,
  );
}

/**
 * Compare two Field override specs for sorting.
 *
 * Comparisons:
 *   1) The collection group.
 *   2) The field path.
 *   3) The ttl.
 *   3) The list of indexes.
 */
export function compareFieldOverride(a: Spec.FieldOverride, b: Spec.FieldOverride): number {
  if (a.collectionGroup !== b.collectionGroup) {
    return a.collectionGroup.localeCompare(b.collectionGroup);
  }

  // The ttl override can be undefined, we only guarantee that true values will
  // come last since those overrides should be executed after disabling TTL per collection.
  const compareTtl = Number(!!a.ttl) - Number(!!b.ttl);
  if (compareTtl) {
    return compareTtl;
  }

  if (a.fieldPath !== b.fieldPath) {
    return a.fieldPath.localeCompare(b.fieldPath);
  }

  return compareArraysSorted(a.indexes, b.indexes, compareFieldIndex);
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
  return QUERY_SCOPE_SEQUENCE.indexOf(a) - QUERY_SCOPE_SEQUENCE.indexOf(b);
}

function compareOrder(a?: API.Order, b?: API.Order): number {
  return ORDER_SEQUENCE.indexOf(a) - ORDER_SEQUENCE.indexOf(b);
}

function compareArrayConfig(a?: API.ArrayConfig, b?: API.ArrayConfig): number {
  return ARRAY_CONFIG_SEQUENCE.indexOf(a) - ARRAY_CONFIG_SEQUENCE.indexOf(b);
}

/**
 * Compare two arrays of objects by looking for the first
 * non-equal element and comparing them.
 *
 * If the shorter array is a perfect prefix of the longer array,
 * then the shorter array is sorted first.
 */
function compareArrays<T>(a: T[], b: T[], fn: (x: T, y: T) => number): number {
  const minFields = Math.min(a.length, b.length);
  for (let i = 0; i < minFields; i++) {
    const cmp = fn(a[i], b[i]);
    if (cmp !== 0) {
      return cmp;
    }
  }

  return a.length - b.length;
}

/**
 * Compare two arrays of objects by first sorting each array, then
 * looking for the first non-equal element and comparing them.
 *
 * If the shorter array is a perfect prefix of the longer array,
 * then the shorter array is sorted first.
 */
function compareArraysSorted<T>(a: T[], b: T[], fn: (x: T, y: T) => number): number {
  const aSorted = a.sort(fn);
  const bSorted = b.sort(fn);

  return compareArrays(aSorted, bSorted, fn);
}
