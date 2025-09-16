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
exports.ensureFirestoreTriggerRegion = exports.clearCache = void 0;
const firestore = __importStar(require("../../../gcp/firestore"));
const error_1 = require("../../../error");
const dbCache = new Map();
const dbPromiseCache = new Map();
/**
 * Clear the database cache. Used for testing.
 * @internal
 */
function clearCache() {
    dbCache.clear();
    dbPromiseCache.clear();
}
exports.clearCache = clearCache;
/**
 * A memoized version of firestore.getDatabase that avoids repeated calls to the API.
 * This implementation prevents concurrent calls for the same database.
 *
 * @param project the project ID
 * @param databaseId the database ID or "(default)"
 */
async function getDatabase(project, databaseId) {
    const key = `${project}/${databaseId}`;
    if (dbCache.has(key)) {
        return dbCache.get(key);
    }
    if (dbPromiseCache.has(key)) {
        return dbPromiseCache.get(key);
    }
    const dbPromise = firestore
        .getDatabase(project, databaseId)
        .then((db) => {
        dbCache.set(key, db);
        dbPromiseCache.delete(key);
        return db;
    })
        .catch((error) => {
        dbPromiseCache.delete(key);
        throw error;
    });
    dbPromiseCache.set(key, dbPromise);
    return dbPromise;
}
/**
 * Sets a firestore event trigger's region to the firestore database region.
 * @param endpoint the firestore endpoint
 */
async function ensureFirestoreTriggerRegion(endpoint) {
    const db = await getDatabase(endpoint.project, endpoint.eventTrigger.eventFilters?.database || "(default)");
    const dbRegion = db.locationId;
    if (!endpoint.eventTrigger.region) {
        endpoint.eventTrigger.region = dbRegion;
    }
    if (endpoint.eventTrigger.region !== dbRegion) {
        throw new error_1.FirebaseError("A firestore trigger location must match the firestore database region.");
    }
}
exports.ensureFirestoreTriggerRegion = ensureFirestoreTriggerRegion;
//# sourceMappingURL=firestore.js.map