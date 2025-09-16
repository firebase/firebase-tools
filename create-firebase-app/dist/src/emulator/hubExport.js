"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HubExport = void 0;
const path = require("path");
const fs = require("fs");
const fse = require("fs-extra");
const http = require("http");
const logger_1 = require("../logger");
const types_1 = require("./types");
const registry_1 = require("./registry");
const error_1 = require("../error");
const hub_1 = require("./hub");
const downloadableEmulators_1 = require("./downloadableEmulators");
const node_fs_1 = require("node:fs");
const track_1 = require("../track");
class HubExport {
    constructor(projectId, options) {
        this.projectId = projectId;
        this.options = options;
        this.exportPath = options.path;
        this.tmpDir = fs.mkdtempSync(`firebase-export-${new Date().getTime()}`);
    }
    static readMetadata(exportPath) {
        const metadataPath = path.join(exportPath, this.METADATA_FILE_NAME);
        if (!fs.existsSync(metadataPath)) {
            return undefined;
        }
        let mdString = "";
        try {
            mdString = fs.readFileSync(metadataPath, "utf8").toString();
            return JSON.parse(mdString);
        }
        catch (err) {
            // JSON parse errors are unreadable. Throw the original.
            throw new error_1.FirebaseError(`Unable to parse metadata file ${metadataPath}: ${mdString}`);
        }
    }
    async exportAll() {
        const toExport = types_1.ALL_EMULATORS.filter(shouldExport);
        if (toExport.length === 0) {
            throw new error_1.FirebaseError("No running emulators support import/export.");
        }
        // TODO(samstern): Once we add other emulators, we have to deal with the fact that
        // there may be an existing metadata file and it may only partially overlap with
        // the new one.
        const metadata = {
            version: hub_1.EmulatorHub.CLI_VERSION,
        };
        if (shouldExport(types_1.Emulators.FIRESTORE)) {
            metadata.firestore = {
                version: (0, downloadableEmulators_1.getDownloadDetails)(types_1.Emulators.FIRESTORE).version,
                path: "firestore_export",
                metadata_file: "firestore_export/firestore_export.overall_export_metadata",
            };
            await this.exportFirestore(metadata);
        }
        if (shouldExport(types_1.Emulators.DATABASE)) {
            metadata.database = {
                version: (0, downloadableEmulators_1.getDownloadDetails)(types_1.Emulators.DATABASE).version,
                path: "database_export",
            };
            await this.exportDatabase(metadata);
        }
        if (shouldExport(types_1.Emulators.AUTH)) {
            metadata.auth = {
                version: hub_1.EmulatorHub.CLI_VERSION,
                path: "auth_export",
            };
            await this.exportAuth(metadata);
        }
        if (shouldExport(types_1.Emulators.STORAGE)) {
            metadata.storage = {
                version: hub_1.EmulatorHub.CLI_VERSION,
                path: "storage_export",
            };
            await this.exportStorage(metadata);
        }
        if (shouldExport(types_1.Emulators.DATACONNECT)) {
            metadata.dataconnect = {
                version: hub_1.EmulatorHub.CLI_VERSION,
                path: "dataconnect_export",
            };
            await this.exportDataConnect(metadata);
        }
        // Make sure the export directory exists
        if (!fs.existsSync(this.exportPath)) {
            fs.mkdirSync(this.exportPath);
        }
        void (0, track_1.trackEmulator)("emulator_export", {
            initiated_by: this.options.initiatedBy,
            emulator_name: types_1.Emulators.HUB,
        });
        // Write the metadata file after everything else has succeeded
        const metadataPath = path.join(this.tmpDir, HubExport.METADATA_FILE_NAME);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, undefined, 2));
        // Remove any existing data in the directory and then swap it with the
        // temp directory.
        logger_1.logger.debug(`hubExport: swapping ${this.tmpDir} with ${this.exportPath}`);
        (0, node_fs_1.rmSync)(this.exportPath, { recursive: true });
        fse.moveSync(this.tmpDir, this.exportPath);
    }
    async exportFirestore(metadata) {
        void (0, track_1.trackEmulator)("emulator_export", {
            initiated_by: this.options.initiatedBy,
            emulator_name: types_1.Emulators.FIRESTORE,
        });
        const firestoreExportBody = {
            database: `projects/${this.projectId}/databases/(default)`,
            export_directory: this.tmpDir,
            export_name: metadata.firestore.path,
        };
        await registry_1.EmulatorRegistry.client(types_1.Emulators.FIRESTORE).post(`/emulator/v1/projects/${this.projectId}:export`, firestoreExportBody);
    }
    async exportDatabase(metadata) {
        const databaseEmulator = registry_1.EmulatorRegistry.get(types_1.Emulators.DATABASE);
        const client = registry_1.EmulatorRegistry.client(types_1.Emulators.DATABASE, { auth: true });
        // Get the list of namespaces
        const inspectURL = `/.inspect/databases.json`;
        const inspectRes = await client.get(inspectURL, {
            queryParams: { ns: this.projectId },
        });
        const namespaces = inspectRes.body.map((instance) => instance.name);
        // Check each one for actual data
        const namespacesToExport = [];
        for (const ns of namespaces) {
            const checkDataPath = `/.json`;
            const checkDataRes = await client.get(checkDataPath, {
                queryParams: {
                    ns,
                    shallow: "true",
                    limitToFirst: 1,
                },
            });
            if (checkDataRes.body !== null) {
                namespacesToExport.push(ns);
            }
            else {
                logger_1.logger.debug(`Namespace ${ns} contained null data, not exporting`);
            }
        }
        // We always need to export every namespace that was imported
        for (const ns of databaseEmulator.getImportedNamespaces()) {
            if (!namespacesToExport.includes(ns)) {
                logger_1.logger.debug(`Namespace ${ns} was imported, exporting.`);
                namespacesToExport.push(ns);
            }
        }
        void (0, track_1.trackEmulator)("emulator_export", {
            initiated_by: this.options.initiatedBy,
            emulator_name: types_1.Emulators.DATABASE,
            count: namespacesToExport.length,
        });
        const dbExportPath = path.join(this.tmpDir, metadata.database.path);
        if (!fs.existsSync(dbExportPath)) {
            fs.mkdirSync(dbExportPath);
        }
        const { host, port } = databaseEmulator.getInfo();
        for (const ns of namespacesToExport) {
            const exportFile = path.join(dbExportPath, `${ns}.json`);
            logger_1.logger.debug(`Exporting database instance: ${ns} to ${exportFile}`);
            await fetchToFile({
                host,
                port,
                path: `/.json?ns=${ns}&format=export`,
                headers: { Authorization: "Bearer owner" },
            }, exportFile);
        }
    }
    async exportAuth(metadata) {
        void (0, track_1.trackEmulator)("emulator_export", {
            initiated_by: this.options.initiatedBy,
            emulator_name: types_1.Emulators.AUTH,
        });
        const { host, port } = registry_1.EmulatorRegistry.get(types_1.Emulators.AUTH).getInfo();
        const authExportPath = path.join(this.tmpDir, metadata.auth.path);
        if (!fs.existsSync(authExportPath)) {
            fs.mkdirSync(authExportPath);
        }
        // TODO: Shall we support exporting other projects too?
        const accountsFile = path.join(authExportPath, "accounts.json");
        logger_1.logger.debug(`Exporting auth users in Project ${this.projectId} to ${accountsFile}`);
        await fetchToFile({
            host,
            port,
            path: `/identitytoolkit.googleapis.com/v1/projects/${this.projectId}/accounts:batchGet?maxResults=-1`,
            headers: { Authorization: "Bearer owner" },
        }, accountsFile);
        const configFile = path.join(authExportPath, "config.json");
        logger_1.logger.debug(`Exporting project config in Project ${this.projectId} to ${accountsFile}`);
        await fetchToFile({
            host,
            port,
            path: `/emulator/v1/projects/${this.projectId}/config`,
            headers: { Authorization: "Bearer owner" },
        }, configFile);
    }
    async exportStorage(metadata) {
        // Clear the export
        const storageExportPath = path.join(this.tmpDir, metadata.storage.path);
        if (fs.existsSync(storageExportPath)) {
            fse.removeSync(storageExportPath);
        }
        fs.mkdirSync(storageExportPath, { recursive: true });
        const storageExportBody = {
            path: storageExportPath,
            initiatedBy: this.options.initiatedBy,
        };
        const res = await registry_1.EmulatorRegistry.client(types_1.Emulators.STORAGE).request({
            method: "POST",
            path: "/internal/export",
            headers: { "Content-Type": "application/json" },
            body: storageExportBody,
            responseType: "stream",
            resolveOnHTTPError: true,
        });
        if (res.status >= 400) {
            throw new error_1.FirebaseError(`Failed to export storage: ${await res.response.text()}`);
        }
    }
    async exportDataConnect(metadata) {
        void (0, track_1.trackEmulator)("emulator_export", {
            initiated_by: this.options.initiatedBy,
            emulator_name: types_1.Emulators.DATACONNECT,
        });
        const instance = registry_1.EmulatorRegistry.get(types_1.Emulators.DATACONNECT);
        if (!instance) {
            throw new error_1.FirebaseError("Unable to export Data Connect emulator data: the Data Connect emulator is not running.");
        }
        const dataconnectExportPath = path.join(this.tmpDir, metadata.dataconnect.path);
        if (fs.existsSync(dataconnectExportPath)) {
            fse.removeSync(dataconnectExportPath);
        }
        fs.mkdirSync(dataconnectExportPath);
        await instance.exportData(dataconnectExportPath);
    }
}
exports.HubExport = HubExport;
HubExport.METADATA_FILE_NAME = "firebase-export-metadata.json";
function fetchToFile(options, path) {
    const writeStream = fs.createWriteStream(path);
    return new Promise((resolve, reject) => {
        http
            .get(options, (response) => {
            response.pipe(writeStream, { end: true }).once("close", resolve);
        })
            .on("error", reject);
    });
}
function shouldExport(e) {
    return types_1.IMPORT_EXPORT_EMULATORS.includes(e) && registry_1.EmulatorRegistry.isRunning(e);
}
