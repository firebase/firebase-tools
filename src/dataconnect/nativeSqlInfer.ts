/**
 * @fileoverview Configuration and environment helpers for Firebase Data Connect Native SQL Type Inference.
 *
 * Architecture & Workflow Overview:
 * 1. Preprocessing Phase (`firebase dataconnect:sql:infer`):
 *    Connects to a live PostgreSQL database (via `FIREBASE_DATACONNECT_POSTGRESQL_STRING`, a running
 *    Data Connect emulator, or a local Cloud SQL Auth Proxy via `--cloud-sql`) and invokes `fdc sql infer`.
 *    The toolkit introspects native SQL queries against the database schema and writes inferred GraphQL
 *    types to `_inferred_types.gql` in the connector directory.
 *
 * 2. Offline Reproducibility (`fdc build` and `dataconnect:sdk:generate`):
 *    When `dataconnect.nativeSqlInferMode` is set to `"db"`, both `fdc build` (used during `firebase deploy`)
 *    and `dataconnect:sdk:generate` pass `SQL_CONNECT_PREVIEW=native_sql_type_inference` and
 *    `SQL_CONNECT_INFER_MODE=db`, but intentionally withhold `FIREBASE_DATACONNECT_POSTGRESQL_STRING`
 *    (setting it to `""`). This ensures builds and SDK generation stay strictly offline, reproducible
 *    from committed `.gql` sources (including `_inferred_types.gql`), and free of database side effects.
 *
 * 3. Feature Gating:
 *    Requires both the `fdcnativesqlinfer` CLI experiment flag (`firebase experiments:enable fdcnativesqlinfer`)
 *    and `"nativeSqlInferMode": "db"` under `"dataconnect"` in `firebase.json`.
 */

import * as experiments from "../experiments";
import { FirebaseError } from "../error";
import { Config } from "../config";

const PREVIEW_FLAG = "native_sql_type_inference";
const INFER_MODE_DB = "db";

/**
 * Reads and validates `dataconnect.nativeSqlInferMode` from firebase.json.
 * @param config the Firebase config.
 * @return the configured mode, or undefined if native SQL type inference is not enabled.
 */
export function nativeSqlInferMode(config?: Config): string | undefined {
  const mode = config?.get("dataconnect.nativeSqlInferMode") as string | undefined;
  if (!mode) {
    return undefined;
  }
  experiments.assertEnabled("fdcnativesqlinfer", "use native SQL type inference");
  if (mode !== INFER_MODE_DB) {
    throw new FirebaseError(
      `Invalid 'dataconnect.nativeSqlInferMode' "${mode}" in firebase.json. The only supported mode is '${INFER_MODE_DB}'.`,
    );
  }
  return mode;
}

/**
 * Environment variables that enable native SQL type inference in the Data Connect toolkit.
 * @param config the Firebase config.
 * @return env vars to pass to the toolkit, or an empty object if inference is not enabled.
 */
export function nativeSqlInferEnv(config?: Config): Record<string, string> {
  if (!nativeSqlInferMode(config)) {
    return {};
  }
  return {
    SQL_CONNECT_PREVIEW: mergePreviewFlag(process.env.SQL_CONNECT_PREVIEW),
    SQL_CONNECT_INFER_MODE: INFER_MODE_DB,
  };
}

function mergePreviewFlag(current?: string): string {
  if (!current) {
    return PREVIEW_FLAG;
  }
  if (current === "*") {
    return current;
  }
  return current.split(",").includes(PREVIEW_FLAG) ? current : `${current},${PREVIEW_FLAG}`;
}
