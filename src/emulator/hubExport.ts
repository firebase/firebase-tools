import * as path from "path";
import * as fs from "fs";

import * as api from "../api";
import { IMPORT_EXPORT_EMULATORS, Emulators, ALL_EMULATORS } from "./types";
import { EmulatorRegistry } from "./registry";
import { FirebaseError } from "../error";
import { EmulatorHub } from "./hub";
import { getDownloadDetails } from "./downloadableEmulators";

export interface ExportMetadata {
  version: string;
  firestore?: {
    version: string;
    path: string;
    metadata_file: string;
  };
}

export class HubExport {
  static METADATA_FILE_NAME = "firebase-export-metadata.json";

  constructor(private projectId: string, private exportPath: string) {}

  public static readMetadata(exportPath: string): ExportMetadata | undefined {
    const metadataPath = path.join(exportPath, this.METADATA_FILE_NAME);
    if (!fs.existsSync(metadataPath)) {
      return undefined;
    }

    return JSON.parse(fs.readFileSync(metadataPath, "utf8").toString()) as ExportMetadata;
  }

  public async exportAll(): Promise<void> {
    const toExport = ALL_EMULATORS.filter(this.shouldExport);
    if (toExport.length === 0) {
      throw new FirebaseError("No running emulators support import/export.");
    }

    // TODO(samstern): Once we add other emulators, we have to deal with the fact that
    // there may be an existing metadata file and it may only partially overlap with
    // the new one.
    const metadata: ExportMetadata = {
      version: EmulatorHub.CLI_VERSION,
    };

    if (this.shouldExport(Emulators.FIRESTORE)) {
      metadata.firestore = {
        version: getDownloadDetails(Emulators.FIRESTORE).version,
        path: "firestore_export",
        metadata_file: "firestore_export/firestore_export.overall_export_metadata",
      };
      await this.exportFirestore(metadata);
    }

    const metadataPath = path.join(this.exportPath, HubExport.METADATA_FILE_NAME);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));
  }

  private async exportFirestore(metadata: ExportMetadata): Promise<void> {
    const firestoreInfo = EmulatorRegistry.get(Emulators.FIRESTORE)!!.getInfo();
    const firestoreHost = `http://${firestoreInfo.host}:${firestoreInfo.port}`;

    const firestoreExportBody = {
      database: `projects/${this.projectId}/databases/(default)`,
      export_directory: this.exportPath,
      export_name: metadata.firestore!!.path,
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
}
