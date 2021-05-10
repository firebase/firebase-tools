import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { runOrigin } from "../api";
import * as proto from "./proto";

const API_VERSION = "v1";

const client = new Client({
  urlPrefix: runOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

export interface IamPolicy {
  version: number;
  bindings: Record<string, unknown>[];
  auditConfigs?: Record<string, unknown>[];
  etag?: string;
}

export const DEFAULT_PUBLIC_POLICY = {
  version: 3,
  bindings: [
    {
      role: "roles/run.invoker",
      members: ["allUsers"],
    },
  ],
};

/**
 * Sets the IAM policy of a Service
 * @param name Fully qualified name of the Service.
 * @param policy The [policy](https://cloud.google.com/run/docs/reference/rest/v1/projects.locations.services/setIamPolicy) to set.
 */
export async function setIamPolicy(name: string, policy: IamPolicy): Promise<void> {
  // Cloud Run has an atypical REST binding for SetIamPolicy. Instead of making the bod a policy and
  // the update mask a query parameter (e.g. Cloud Functions v1) the request body is the literal
  // proto.
  interface Request {
    policy: IamPolicy;
    updateMask: string;
  }
  try {
    await client.post<Request, IamPolicy>(`${name}:setIamPolicy`, {
      policy,
      updateMask: proto.fieldMasks(policy).join(","),
    });
  } catch (err) {
    throw new FirebaseError(`Failed to set the IAM Policy on the Service ${name}`, {
      original: err,
    });
  }
}
