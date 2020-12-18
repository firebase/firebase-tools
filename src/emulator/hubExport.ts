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
import { DatabaseEmulator } from "./databaseEmulator";

export interface FirestoreExportMetadata {
  version: string;
  path: string;
  metadata_file: string;
}

export interface DatabaseExportMetadata {
  version: string;
  path: string;
}

export interface AuthExportMetadata {
  version: string;
  path: string;
}

export interface ExportMetadata {
  version: string;
  firestore?: FirestoreExportMetadata;
  database?: DatabaseExportMetadata;
  auth?: AuthExportMetadata;
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
    const toExport = ALL_EMULATORS.filter(shouldExport);
    if (toExport.length === 0) {
      throw new FirebaseError("No running emulators support import/export.");
    }

    // TODO(samstern): Once we add other emulators, we have to deal with the fact that
    // there may be an existing metadata file and it may only partially overlap with
    // the new one.
    const metadata: ExportMetadata = {
      version: EmulatorHub.CLI_VERSION,
    };

    if (shouldExport(Emulators.FIRESTORE)) {
      metadata.firestore = {
        version: getDownloadDetails(Emulators.FIRESTORE).version,
        path: "firestore_export",
        metadata_file: "firestore_export/firestore_export.overall_export_metadata",
      };
      await this.exportFirestore(metadata);
    }

    if (shouldExport(Emulators.DATABASE)) {
      metadata.database = {
        version: getDownloadDetails(Emulators.DATABASE).version,
        path: "database_export",
      };
      await this.exportDatabase(metadata);
    }

    if (shouldExport(Emulators.AUTH)) {
      metadata.auth = {
        version: EmulatorHub.CLI_VERSION,
        path: "auth_export",
      };
      await this.exportAuth(metadata);
    }

    const metadataPath = path.join(this.exportPath, HubExport.METADATA_FILE_NAME);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, undefined, 2));
  }

  private async exportFirestore(metadata: ExportMetadata): Promise<void> {
    const firestoreInfo = EmulatorRegistry.get(Emulators.FIRESTORE)!.getInfo();
    const firestoreHost = `http://${EmulatorRegistry.getInfoHostString(firestoreInfo)}`;

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
    const databaseEmulator = EmulatorRegistry.get(Emulators.DATABASE) as DatabaseEmulator;
    const databaseAddr = `http://${EmulatorRegistry.getInfoHostString(databaseEmulator.getInfo())}`;

    // Get the list of namespaces
    const inspectURL = `/.inspect/databases.json?ns=${this.projectId}`;
    const inspectRes = await api.request("GET", inspectURL, { origin: databaseAddr, auth: true });
    const namespaces = inspectRes.body.map((instance: any) => instance.name);

    // Check each one for actual data
    const namespacesToExport = [];
    for (const ns of namespaces) {
      const checkDataPath = `/.json?ns=${ns}&shallow=true&limitToFirst=1`;
      const checkDataRes = await api.request("GET", checkDataPath, {
        origin: databaseAddr,
        auth: true,
      });
      if (checkDataRes.body !== null) {
        namespacesToExport.push(ns);
      } else {
        logger.debug(`Namespace ${ns} contained null data, not exporting`);
      }
    }

    // We always need to export every namespace that was imported
    for (const ns of databaseEmulator.getImportedNamespaces()) {
      if (!namespacesToExport.includes(ns)) {
        logger.debug(`Namespace ${ns} was imported, exporting.`);
        namespacesToExport.push(ns);
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

    const { host, port } = databaseEmulator.getInfo();
    for (const ns of namespacesToExport) {
      const exportFile = path.join(dbExportPath, `${ns}.json`);

      logger.debug(`Exporting database instance: ${ns} to ${exportFile}`);
      await fetchToFile(
        {
          host,
          port,
          path: `/.json?ns=${ns}&format=export`,
          headers: { Authorization: "Bearer owner" },
        },
        exportFile
      );
    }
  }

  private async exportAuth(metadata: ExportMetadata): Promise<void> {
    const { host, port } = EmulatorRegistry.get(Emulators.AUTH)!.getInfo();

    const authExportPath = path.join(this.exportPath, metadata.auth!.path);
    if (!fs.existsSync(authExportPath)) {
      fs.mkdirSync(authExportPath);
    }

    // TODO: Shall we support exporting other projects too?

    const accountsFile = path.join(authExportPath, "accounts.json");
    logger.debug(`Exporting auth users in Project ${this.projectId} to ${accountsFile}`);
    await fetchToFile(
      {
        host,
        port,
        path: `/identitytoolkit.googleapis.com/v1/projects/${this.projectId}/accounts:batchGet?limit=-1`,
        headers: { Authorization: "Bearer owner" },
      },
      accountsFile
    );

    const configFile = path.join(authExportPath, "config.json");
    logger.debug(`Exporting project config in Project ${this.projectId} to ${accountsFile}`);
    await fetchToFile(
      {
        host,
        port,
        path: `/emulator/v1/projects/${this.projectId}/config`,
        headers: { Authorization: "Bearer owner" },
      },
      configFile
    );
  }
}

function fetchToFile(options: http.RequestOptions, path: fs.PathLike): Promise<void> {
  const writeStream = fs.createWriteStream(path);
  return new Promise((resolve, reject) => {
    http
      .get(options, (response) => {
        response.pipe(writeStream, { end: true }).once("close", resolve);
      })
      .on("error", reject);
  });
}

function shouldExport(e: Emulators): boolean {
  return IMPORT_EXPORT_EMULATORS.includes(e) && EmulatorRegistry.isRunning(e);
}
