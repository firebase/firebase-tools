import { Client } from "../apiv2";
import { cloudTestingOrigin } from "../api";

export const API_VERSION = "v1";

export const client = new Client({
  urlPrefix: cloudTestingOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

type EnvironmentType =
  | "ENVIRONMENT_TYPE_UNSPECIFIED"
  | "ANDROID"
  | "IOS"
  | "NETWORK_CONFIGURATION"
  | "PROVIDED_SOFTWARE"
  | "DEVICE_IP_BLOCKS";

type TestEnvironmentCatalog = unknown;

/**
 * Gets the catalog of supported test environments.
 */
export async function testEnvironmentCatalog(
  projectId: string,
  environmentType: EnvironmentType,
): Promise<unknown> {
  const name = `testEnvironmentCatalog/${environmentType}`;

  const queryParams: Record<string, string> = { projectId };
  const res = await client.get<TestEnvironmentCatalog>(name, { queryParams });

  return res.body;
}
