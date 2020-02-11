import * as utils from "../utils";
import * as api from "../api";
import { IMPORT_EXPORT_EMULATORS, Emulators } from "./types";
import { EmulatorRegistry } from "./registry";

export class HubExport {
  constructor(private projectId: string, private exportPath: string) {}

  public async exportAll(): Promise<void> {
    const toExport = IMPORT_EXPORT_EMULATORS.filter((e) => {
      return EmulatorRegistry.isRunning(e);
    });

    if (toExport.length === 0) {
      utils.logLabeledWarning("emulators", "No running emulators support import/export.");
      return;
    }

    // TODO: take the directory as an argument
    // TODO: what if the directory already contains an export and a manifest
    // TODO: Make a manifest, write it.

    if (toExport.indexOf(Emulators.FIRESTORE) >= 0) {
      await this.exportFirestore();
    }
  }

  private async exportFirestore(): Promise<void> {
    const firestoreInfo = EmulatorRegistry.get(Emulators.FIRESTORE)!!.getInfo();
    const firestoreHost = `http://${firestoreInfo.host}:${firestoreInfo.port}`;

    // TODO: path argument
    const firestoreExportBody = {
      database: `projects/${this.projectId}/databases/(default)`,
      export_directory: this.exportPath,
    };

    return api.request("POST", `/emulator/v1/projects/${this.projectId}:export`, {
      origin: firestoreHost,
      json: true,
      data: firestoreExportBody,
    });
  }
}
