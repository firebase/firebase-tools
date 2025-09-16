"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareFieldOverride = exports.compareApiField = exports.compareApiBackupSchedule = exports.compareApiBackup = exports.compareLocation = exports.compareApiDatabase = exports.compareApiIndex = exports.compareSpecIndex = void 0;
const API = __importStar(require("./api-types"));
const util = __importStar(require("./util"));
const QUERY_SCOPE_SEQUENCE = [
    API.QueryScope.COLLECTION_GROUP,
    API.QueryScope.COLLECTION,
    undefined,
];
const API_SCOPE_SEQUENCE = [
    API.ApiScope.ANY_API,
    API.ApiScope.DATASTORE_MODE_API,
    API.ApiScope.MONGODB_COMPATIBLE_API,
    undefined,
];
const DENSITY_SEQUENCE = [
    API.Density.DENSITY_UNSPECIFIED,
    API.Density.SPARSE_ALL,
    API.Density.SPARSE_ANY,
    API.Density.DENSE,
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
 *   4) The API scope.
 *   5) The index density.
 *   6) Whether it's multikey.
 *   7) Whether it's unique.
 */
function compareSpecIndex(a, b) {
    if (a.collectionGroup !== b.collectionGroup) {
        return a.collectionGroup.localeCompare(b.collectionGroup);
    }
    if (a.queryScope !== b.queryScope) {
        return compareQueryScope(a.queryScope, b.queryScope);
    }
    let cmp = compareArrays(a.fields, b.fields, compareIndexField);
    if (cmp !== 0) {
        return cmp;
    }
    cmp = compareApiScope(a.apiScope, b.apiScope);
    if (cmp !== 0) {
        return cmp;
    }
    cmp = compareDensity(a.density, b.density);
    if (cmp !== 0) {
        return cmp;
    }
    cmp = compareBoolean(a.multikey, b.multikey);
    if (cmp !== 0) {
        return cmp;
    }
    return compareBoolean(a.unique, b.unique);
}
exports.compareSpecIndex = compareSpecIndex;
/**
 * Compare two Index api entries for sorting.
 *
 * Comparisons:
 *   1) The collection group.
 *   2) The query scope.
 *   3) The fields list.
 *   4) The API scope.
 *   5) The index density.
 *   6) Whether it's multikey.
 *   7) Whether it's unique.
 */
function compareApiIndex(a, b) {
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
    let cmp = compareArrays(a.fields, b.fields, compareIndexField);
    if (cmp !== 0) {
        return cmp;
    }
    cmp = compareApiScope(a.apiScope, b.apiScope);
    if (cmp !== 0) {
        return cmp;
    }
    cmp = compareDensity(a.density, b.density);
    if (cmp !== 0) {
        return cmp;
    }
    cmp = compareBoolean(a.multikey, b.multikey);
    if (cmp !== 0) {
        return cmp;
    }
    return compareBoolean(a.unique, b.unique);
}
exports.compareApiIndex = compareApiIndex;
/**
 * Compare two Database api entries for sorting.
 *
 * Comparisons:
 *   1) The databaseId (name)
 */
function compareApiDatabase(a, b) {
    // Name should always be unique and present
    return a.name > b.name ? 1 : -1;
}
exports.compareApiDatabase = compareApiDatabase;
/**
 * Compare two Location api entries for sorting.
 *
 * Comparisons:
 *   1) The locationId.
 */
function compareLocation(a, b) {
    // LocationId should always be unique and present
    return a.locationId > b.locationId ? 1 : -1;
}
exports.compareLocation = compareLocation;
/**
 * Compare two Backup API entries for sorting.
 * Ordered by: location, snapshotTime (descending), then name
 */
function compareApiBackup(a, b) {
    // the location is embedded in the name (projects/myproject/locations/mylocation/backups/mybackup)
    const aLocation = a.name.split("/")[3];
    const bLocation = b.name.split("/")[3];
    if (aLocation && bLocation && aLocation !== bLocation) {
        return aLocation > bLocation ? 1 : -1;
    }
    if (a.snapshotTime && b.snapshotTime && a.snapshotTime !== b.snapshotTime) {
        return a.snapshotTime > b.snapshotTime ? -1 : 1;
    }
    // Name should always be unique and present
    return a.name > b.name ? 1 : -1;
}
exports.compareApiBackup = compareApiBackup;
/**
 * Compare two BackupSchedule API entries for sorting.
 *
 * Daily schedules should precede weekly ones. Break ties by name.
 */
function compareApiBackupSchedule(a, b) {
    if (a.dailyRecurrence && !b.dailyRecurrence) {
        return -1;
    }
    else if (a.weeklyRecurrence && b.dailyRecurrence) {
        return 1;
    }
    // Name should always be unique and present
    return a.name > b.name ? 1 : -1;
}
exports.compareApiBackupSchedule = compareApiBackupSchedule;
/**
 * Compare two Field api entries for sorting.
 *
 * Comparisons:
 *   1) The collection group.
 *   2) The field path.
 *   3) The indexes list in the config.
 */
function compareApiField(a, b) {
    const aName = util.parseFieldName(a.name);
    const bName = util.parseFieldName(b.name);
    if (aName.collectionGroupId !== bName.collectionGroupId) {
        return aName.collectionGroupId.localeCompare(bName.collectionGroupId);
    }
    if (aName.fieldPath !== bName.fieldPath) {
        return aName.fieldPath.localeCompare(bName.fieldPath);
    }
    return compareArraysSorted(a.indexConfig.indexes || [], b.indexConfig.indexes || [], compareApiIndex);
}
exports.compareApiField = compareApiField;
/**
 * Compare two Field override specs for sorting.
 *
 * Comparisons:
 *   1) The collection group.
 *   2) The field path.
 *   3) The ttl.
 *   3) The list of indexes.
 */
function compareFieldOverride(a, b) {
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
exports.compareFieldOverride = compareFieldOverride;
/**
 * Compare two IndexField objects.
 *
 * Comparisons:
 *   1) Field path.
 *   2) Sort order (if it exists).
 *   3) Array config (if it exists).
 *   4) Vector config (if it exists).
 */
function compareIndexField(a, b) {
    if (a.fieldPath !== b.fieldPath) {
        return a.fieldPath.localeCompare(b.fieldPath);
    }
    if (a.order !== b.order) {
        return compareOrder(a.order, b.order);
    }
    if (a.arrayConfig !== b.arrayConfig) {
        return compareArrayConfig(a.arrayConfig, b.arrayConfig);
    }
    if (a.vectorConfig !== b.vectorConfig) {
        return compareVectorConfig(a.vectorConfig, b.vectorConfig);
    }
    return 0;
}
function compareFieldIndex(a, b) {
    if (a.queryScope !== b.queryScope) {
        return compareQueryScope(a.queryScope, b.queryScope);
    }
    if (a.order !== b.order) {
        return compareOrder(a.order, b.order);
    }
    if (a.arrayConfig !== b.arrayConfig) {
        return compareArrayConfig(a.arrayConfig, b.arrayConfig);
    }
    let cmp = compareApiScope(a.apiScope, b.apiScope);
    if (cmp !== 0) {
        return cmp;
    }
    cmp = compareDensity(a.density, b.density);
    if (cmp !== 0) {
        return cmp;
    }
    cmp = compareBoolean(a.multikey, b.multikey);
    if (cmp !== 0) {
        return cmp;
    }
    return compareBoolean(a.unique, b.unique);
}
function compareQueryScope(a, b) {
    return QUERY_SCOPE_SEQUENCE.indexOf(a) - QUERY_SCOPE_SEQUENCE.indexOf(b);
}
function compareApiScope(a, b) {
    if (a === b) {
        return 0;
    }
    if (a === undefined) {
        return -1;
    }
    if (b === undefined) {
        return 1;
    }
    return API_SCOPE_SEQUENCE.indexOf(a) - API_SCOPE_SEQUENCE.indexOf(b);
}
function compareDensity(a, b) {
    if (a === b) {
        return 0;
    }
    if (a === undefined) {
        return -1;
    }
    if (b === undefined) {
        return 1;
    }
    return DENSITY_SEQUENCE.indexOf(a) - DENSITY_SEQUENCE.indexOf(b);
}
function compareOrder(a, b) {
    return ORDER_SEQUENCE.indexOf(a) - ORDER_SEQUENCE.indexOf(b);
}
function compareBoolean(a, b) {
    if (a === b) {
        return 0;
    }
    if (a === undefined) {
        return -1;
    }
    if (b === undefined) {
        return 1;
    }
    return Number(a) - Number(b);
}
function compareArrayConfig(a, b) {
    return ARRAY_CONFIG_SEQUENCE.indexOf(a) - ARRAY_CONFIG_SEQUENCE.indexOf(b);
}
function compareVectorConfig(a, b) {
    if (!a) {
        if (!b) {
            return 0;
        }
        else {
            return 1;
        }
    }
    else if (!b) {
        return -1;
    }
    return a.dimension - b.dimension;
}
/**
 * Compare two arrays of objects by looking for the first
 * non-equal element and comparing them.
 *
 * If the shorter array is a perfect prefix of the longer array,
 * then the shorter array is sorted first.
 */
function compareArrays(a, b, fn) {
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
function compareArraysSorted(a, b, fn) {
    const aSorted = a.sort(fn);
    const bSorted = b.sort(fn);
    return compareArrays(aSorted, bSorted, fn);
}
//# sourceMappingURL=api-sort.js.map