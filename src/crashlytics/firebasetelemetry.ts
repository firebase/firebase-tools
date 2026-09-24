import { firebaseTelemetryAdminOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";

const API_VERSION = "v1alpha";

export interface TelemetryConfig {
  name: string;
  appId: string;
  logBucket: string;
  samplingRate: number;
  enablementState?: string;
}

/**
 * Creates or updates a Firebase Telemetry Config resource for an app.
 * Automatically falls back to PATCH if the config already exists (409 ALREADY_EXISTS).
 */
export async function createOrUpdateTelemetryConfig(
  projectId: string,
  appId: string,
  logBucket: string,
  samplingRate = 1,
): Promise<TelemetryConfig> {
  const client = new Client({ urlPrefix: firebaseTelemetryAdminOrigin(), apiVersion: API_VERSION });
  const configId = appId.replace(/[:.]/g, "-");
  const configName = `projects/${projectId}/locations/global/configs/${configId}`;
  const configBody: TelemetryConfig = {
    name: configName,
    appId,
    logBucket,
    samplingRate,
  };

  try {
    const res = await client.post<TelemetryConfig, TelemetryConfig>(
      `/projects/${projectId}/locations/global/configs?configId=${configId}`,
      configBody,
    );
    return res.body;
  } catch (err: any) {
    if (err.status === 409) {
      try {
        const patchRes = await client.patch<TelemetryConfig, TelemetryConfig>(
          `/projects/${projectId}/locations/global/configs/${configId}?updateMask=logBucket,samplingRate`,
          configBody,
        );
        return patchRes.body;
      } catch (patchErr: any) {
        const msg = patchErr.message || JSON.stringify(patchErr.body) || patchErr;
        throw new FirebaseError(
          `Failed to patch telemetry config for web app ${appId} (status ${patchErr.status}): ${msg}`,
          { original: patchErr },
        );
      }
    }
    const msg = err.message || JSON.stringify(err.body) || err;
    throw new FirebaseError(
      `Failed to configure telemetry for web app ${appId} (status ${err.status}): ${msg}`,
      { original: err },
    );
  }
}
