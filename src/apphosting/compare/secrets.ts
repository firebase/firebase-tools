import * as path from "path";
import * as fs from "fs-extra";
import * as csm from "../../gcp/secretManager";
import * as apphosting from "../../gcp/apphosting";
import { AppHostingYamlConfig } from "../yaml";
import { getProjectNumber } from "../../getProjectNumber";
import { serviceAccountsForBackend, grantSecretAccess, toMulti } from "../secrets";
import { logger } from "../../logger";

export interface SecretMapping {
  originalName: string;
  mockSecretName: string;
  mockValue: string;
}

export async function setupSandboxSecrets(
  projectId: string,
  location: string,
  appPath: string,
  slotIndex: number,
  backendIdA: string,
  backendIdB: string
): Promise<SecretMapping[]> {
  const yamlPath = path.join(appPath, "apphosting.yaml");
  if (!(await fs.pathExists(yamlPath))) {
    return [];
  }

  const config = await AppHostingYamlConfig.loadFromFile(yamlPath);
  const secretEntries = Object.entries(config.env).filter(([, val]) => val.secret !== undefined);
  if (secretEntries.length === 0) {
    return [];
  }

  const projectNumber = await getProjectNumber({ projectId });
  const mappings: SecretMapping[] = [];

  // Fetch backends to extract their service accounts
  const [backendA, backendB] = await Promise.all([
    apphosting.getBackend(projectId, location, backendIdA),
    apphosting.getBackend(projectId, location, backendIdB)
  ]);

  const [accountsA, accountsB] = await Promise.all([
    serviceAccountsForBackend(projectNumber, backendA),
    serviceAccountsForBackend(projectNumber, backendB)
  ]);

  const multiAccountsA = toMulti(accountsA);
  const multiAccountsB = toMulti(accountsB);

  // Combine build/run service accounts from both backends
  const combinedAccounts = {
    buildServiceAccounts: Array.from(new Set([...multiAccountsA.buildServiceAccounts, ...multiAccountsB.buildServiceAccounts])),
    runServiceAccounts: Array.from(new Set([...multiAccountsA.runServiceAccounts, ...multiAccountsB.runServiceAccounts]))
  };

  for (const [envName, envVal] of secretEntries) {
    const originalSecretName = envVal.secret!;
    // Clean and build mock secret name
    const cleanName = originalSecretName.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
    const mockSecretName = `cmp-sec-${slotIndex}-${cleanName}`.substring(0, 255);
    const mockValue = `mock-value-for-${envName}-slot-${slotIndex}`;

    logger.info(`Setting up sandboxed secret for ${envName}: ${mockSecretName}...`);

    const exists = await csm.secretExists(projectId, mockSecretName);
    if (!exists) {
      await csm.createSecret(projectId, mockSecretName, {
        "created-by": "apphosting-compare-tool",
        "slot": String(slotIndex)
      });
    }

    await csm.addVersion(projectId, mockSecretName, mockValue);
    await grantSecretAccess(projectId, projectNumber, mockSecretName, combinedAccounts);

    mappings.push({
      originalName: originalSecretName,
      mockSecretName,
      mockValue
    });
  }

  return mappings;
}

export async function cleanupSandboxSecrets(projectId: string, mappings: SecretMapping[]): Promise<void> {
  if (mappings.length === 0) return;

  logger.info("Cleaning up sandboxed secrets in Secret Manager...");
  await Promise.allSettled(
    mappings.map(m => csm.deleteSecret(projectId, m.mockSecretName).catch(e => logger.debug(e)))
  );
}
