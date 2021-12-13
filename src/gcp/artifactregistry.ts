import { Client } from "../apiv2";
import { artifactRegistryDomain } from "../api";

export const API_VERSION = "v1beta2";

const client = new Client({
  urlPrefix: artifactRegistryDomain,
  auth: true,
  apiVersion: API_VERSION,
});

export interface Operation {
  name: string;
  done: boolean;
  error?: { code: number; message: string; details: unknown };
  response?: {
    "@type": "type.googleapis.com/google.protobuf.Empty";
  };
  metadata?: {
    "@type": "type.googleapis.com/google.devtools.artifactregistry.v1beta2.OperationMetadata";
  };
}

/** Delete a package. */
export async function deletePackage(name: string): Promise<Operation> {
  const res = await client.delete<Operation>(name);
  return res.body;
}
