import { EmulatorHubClient } from "../../../emulator/hubClient.js";
import { EmulatorInfo, Emulators } from "../../../emulator/types.js";
import { Client } from "../../../apiv2.js";
import { DATACONNECT_API_VERSION } from "../../../dataconnect/dataplaneClient.js";
import type { FirebaseMcpServer } from "../../index";

function formatEndpoint(emulatorInfo: EmulatorInfo): { host: string; port: number; url: string } {
  const host = emulatorInfo.host.includes(":") ? `[${emulatorInfo.host}]` : emulatorInfo.host;
  return {
    host: emulatorInfo.host,
    port: emulatorInfo.port,
    url: `http://${host}:${emulatorInfo.port}`,
  };
}

export async function getDataConnectEmulatorClient(host: FirebaseMcpServer): Promise<Client> {
  const emulatorUrl = await host.getEmulatorUrl(Emulators.DATACONNECT);

  const apiClient = new Client({
    urlPrefix: emulatorUrl,
    apiVersion: DATACONNECT_API_VERSION,
    auth: false,
  });

  return apiClient;
}
