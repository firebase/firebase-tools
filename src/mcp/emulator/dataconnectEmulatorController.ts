import { EmulatorHubClient } from "../../emulator/hubClient.js";
import { EmulatorInfo, Emulators } from "../../emulator/types.js";

export interface DataConnectEmulatorDetails {
  host: string;
  port: number;
  url: string;
}

function formatEndpoint(emulatorInfo: EmulatorInfo): DataConnectEmulatorDetails {
  const host = emulatorInfo.host.includes(":") ? `[${emulatorInfo.host}]` : emulatorInfo.host;
  return {
    host: emulatorInfo.host,
    port: emulatorInfo.port,
    url: `http://${host}:${emulatorInfo.port}`,
  };
}

export async function getDataConnectEmulatorDetails(
  hubClient?: EmulatorHubClient,
): Promise<DataConnectEmulatorDetails | undefined> {
  if (!hubClient || !hubClient.foundHub()) {
    return undefined;
  }

  try {
    const emulators = await hubClient.getEmulators();
    const dcEmulatorInfo = emulators[Emulators.DATACONNECT];

    if (dcEmulatorInfo) {
      return formatEndpoint(dcEmulatorInfo);
    }
  } catch (error) {
    console.warn(
      `MCP: Error querying EmulatorHub for DataConnect emulator: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
  return undefined;
}
