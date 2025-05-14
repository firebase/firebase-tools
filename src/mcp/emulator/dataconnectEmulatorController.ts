// src/mcp/emulator/dataconnectEmulatorController.ts
import { EmulatorHubClient } from "../../emulator/hubClient.js";
import { EmulatorInfo, Emulators } from "../../emulator/types.js";

export interface DataConnectEmulatorDetails {
  host: string;
  port: number;
  url: string; // e.g., http://localhost:9099
}

function formatEndpoint(emulatorInfo: EmulatorInfo): DataConnectEmulatorDetails {
  // Handle IPv6 host format for URL construction
  const host = emulatorInfo.host.includes(":") ? `[${emulatorInfo.host}]` : emulatorInfo.host;
  return {
    host: emulatorInfo.host, // Store original host
    port: emulatorInfo.port,
    url: `http://${host}:${emulatorInfo.port}`,
  };
}

export async function getDataConnectEmulatorDetails(
  hubClient?: EmulatorHubClient,
): Promise<DataConnectEmulatorDetails | undefined> {
  if (!hubClient || !hubClient.foundHub()) {
    return undefined; // Hub itself not found
  }

  try {
    const emulators = await hubClient.getEmulators();
    const dcEmulatorInfo = emulators[Emulators.DATACONNECT]; // Assumes Emulators.DATACONNECT enum member exists

    if (dcEmulatorInfo) {
      return formatEndpoint(dcEmulatorInfo);
    }
  } catch (error) {
    // Log detailed error for server-side debugging, but return undefined to the tool
    console.warn(
      `MCP: Error querying EmulatorHub for DataConnect emulator: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
  return undefined; // DataConnect emulator specifically not found
}
