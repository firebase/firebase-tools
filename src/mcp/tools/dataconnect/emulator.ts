import { EmulatorHubClient } from "../../../emulator/hubClient.js";
import { EmulatorInfo, Emulators } from "../../../emulator/types.js";
import { Client } from "../../../apiv2.js";
import { DATACONNECT_API_VERSION } from "../../../dataconnect/dataplaneClient.js";

function formatEndpoint(emulatorInfo: EmulatorInfo): { host: string; port: number; url: string } {
  const host = emulatorInfo.host.includes(":") ? `[${emulatorInfo.host}]` : emulatorInfo.host;
  return {
    host: emulatorInfo.host,
    port: emulatorInfo.port,
    url: `http://${host}:${emulatorInfo.port}`,
  };
}

export async function getDataConnectEmulatorClient(hubClient?: EmulatorHubClient): Promise<Client> {
  if (!hubClient) {
    throw Error(
      "Emulator Hub not found or is not running. Please ensure the emulator is started, you can start the Data Connect emualtor by running `firebase emulators:start --only dataconnect`.",
    );
  }

  const emulators = await hubClient.getEmulators();
  const dcEmulatorInfo = emulators[Emulators.DATACONNECT];

  if (!dcEmulatorInfo) {
    throw Error(
      "No Data Connect Emulator found running, you can start the emualtor by running `firebase emulators:start --only dataconnect`.",
    );
  }

  const emulatorDetails = formatEndpoint(dcEmulatorInfo);

  const apiClient = new Client({
    urlPrefix: emulatorDetails.url,
    apiVersion: DATACONNECT_API_VERSION,
    auth: false,
  });

  return apiClient;
}
