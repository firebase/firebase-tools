import { Emulators } from "../../../emulator/types";
import { Client } from "../../../apiv2";
import { DATACONNECT_API_VERSION } from "../../../dataconnect/dataplaneClient";
import type { FirebaseMcpServer } from "../../index";

export async function getDataConnectEmulatorClient(host: FirebaseMcpServer): Promise<Client> {
  const emulatorUrl = await host.getEmulatorUrl(Emulators.DATACONNECT);

  const apiClient = new Client({
    urlPrefix: emulatorUrl,
    apiVersion: DATACONNECT_API_VERSION,
  });

  return apiClient;
}
