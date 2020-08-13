import * as path from "path";
import * as fs from "fs";
import * as http from "http";

import * as api from "../api";
import * as logger from "../logger";
import { IMPORT_EXPORT_EMULATORS, Emulators, ALL_EMULATORS } from "./types";
import { EmulatorRegistry } from "./registry";
import { FirebaseError } from "../error";
import { EmulatorHub } from "./hub";
import { getDownloadDetails } from "./downloadableEmulators";

export interface FirestoreExportMetadata {
  version: string;
  path: string;
  metadata_file: string;
}

export interface DatabaseExportMetadata {
  version: string;
  path: string;
}
export interface ExportMetadata {
  version: string;
  firestore?: FirestoreExportMetadata;
  database?: DatabaseExportMetadata;
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

    if (this.shouldExport(Emulators.DATABASE)) {
      metadata.database = {
        version: getDownloadDetails(Emulators.DATABASE).version,
        path: "database_export",
      };
      await this.exportDatabase(metadata);
    }

    const metadataPath = path.join(this.exportPath, HubExport.METADATA_FILE_NAME);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, undefined, 2));
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

  private async exportDatabase(metadata: ExportMetadata): Promise<void> {
    const databaseInfo = EmulatorRegistry.get(Emulators.DATABASE)!.getInfo();
    const databaseAddr = `http://${databaseInfo.host}:${databaseInfo.port}`;

    // Get the list of namespaces
    const inspectURL = `/.inspect/databases.json?ns=${this.projectId}`;
    const inspectRes = await api.request("GET", inspectURL, { origin: databaseAddr, auth: true });
    const namespaces = inspectRes.body.map((instance: any) => instance.name);

    // Check each one for actual data
    const nonEmptyNamespaces = [];
    for (const ns of namespaces) {
      const checkDataPath = `/.json?ns=${ns}&shallow=true&limitToFirst=1`;
      const checkDataRes = await api.request("GET", checkDataPath, {
        origin: databaseAddr,
        auth: true,
      });
      if (checkDataRes.body !== null) {
        nonEmptyNamespaces.push(ns);
      } else {
        logger.debug(`Namespace ${ns} contained null data, not exporting`);
      }
    }

    // Make sure the export directory exists
    if (!fs.existsSync(this.exportPath)) {
      fs.mkdirSync(this.exportPath);
    }

    const dbExportPath = path.join(this.exportPath, metadata.database!.path);
    if (!fs.existsSync(dbExportPath)) {
      fs.mkdirSync(dbExportPath);
    }

    for (const ns of nonEmptyNamespaces) {
      const exportFile = path.join(dbExportPath, `${ns}.json`);
      const writeStream = fs.createWriteStream(exportFile);

      logger.debug(`Exporting database instance: ${ns} to ${exportFile}`);
      await new Promise((resolve, reject) => {
        http
          .get(
            {
              host: databaseInfo.host,
              port: databaseInfo.port,
              path: `/.json?ns=${ns}&format=export`,
              headers: { Authorization: "Bearer owner" },
            },
            (response) => {
              response.pipe(writeStream, { end: true }).once("close", resolve);
            }
          )
          .on("error", reject);
      });
    }
  }

  private shouldExport(e: Emulators): boolean {
    return IMPORT_EXPORT_EMULATORS.indexOf(e) >= 0 && EmulatorRegistry.isRunning(e);
  }
}
