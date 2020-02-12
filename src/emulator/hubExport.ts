import * as path from "path";
import * as fs from "fs";

import * as utils from "../utils";
import * as api from "../api";
import { IMPORT_EXPORT_EMULATORS, Emulators, ALL_EMULATORS } from "./types";
import { EmulatorRegistry } from "./registry";

export interface ExportMetadata {
  firestore?: string;
}

export class HubExport {
  constructor(private projectId: string, private exportPath: string) {}

  public async exportAll(): Promise<void> {
    const someExport = ALL_EMULATORS.filter(this.shouldExport).length >= 0;
    if (!someExport) {
      utils.logLabeledWarning("emulators", "No running emulators support import/export.");
      return;
    }

    // TODO(samstern): Once we add other emulators, we have to deal with the fact that
    // there may be an existing metadata file and it may only partially overlap with
    // the new one.
    const metadata: ExportMetadata = {};

    if (this.shouldExport(Emulators.FIRESTORE)) {
      metadata.firestore = this.getExportName(Emulators.FIRESTORE);
      await this.exportFirestore();
    }

    const metadataPath = path.join(this.exportPath, "metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));
  }

  private async exportFirestore(): Promise<void> {
    const firestoreInfo = EmulatorRegistry.get(Emulators.FIRESTORE)!!.getInfo();
    const firestoreHost = `http://${firestoreInfo.host}:${firestoreInfo.port}`;

    const firestoreExportBody = {
      database: `projects/${this.projectId}/databases/(default)`,
      export_directory: this.exportPath,
      export_name: this.getExportName(Emulators.FIRESTORE),
    };

    return api.request("POST", `/emulator/v1/projects/${this.projectId}:export`, {
      origin: firestoreHost,
      json: true,
      data: firestoreExportBody,
    });
  }

  private shouldExport(e: Emulators): boolean {
    return IMPORT_EXPORT_EMULATORS.indexOf(e) >= 0 && EmulatorRegistry.isRunning(e);
  }

  private getExportName(e: Emulators): string {
    switch (e) {
      case Emulators.FIRESTORE:
        return "firestore_export";
      default:
        throw new Error(`Export name not defined for ${e}`);
    }
  }
}
