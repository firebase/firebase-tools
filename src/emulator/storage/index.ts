import { tmpdir } from "os";
import * as utils from "../../utils";
import { Constants } from "../constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { createApp } from "./server";
import { StorageLayer, StoredFile } from "./files";
import { EmulatorLogger } from "../emulatorLogger";
import { createStorageRulesManager, StorageRulesManager } from "./rules/manager";
import { StorageRulesIssues, StorageRulesRuntime } from "./rules/runtime";
import { SourceFile } from "./rules/types";
import * as express from "express";
import {
  getAdminCredentialValidator,
  getAdminOnlyFirebaseRulesValidator,
  getFirebaseRulesValidator,
  FirebaseRulesValidator,
} from "./rules/utils";
import { Persistence } from "./persistence";
import { UploadService } from "./upload";
import { CloudStorageBucketMetadata } from "./metadata";
import { StorageCloudFunctions } from "./cloudFunctions";

export type RulesConfig = {
  resource: string;
  rules: SourceFile;
};

export interface StorageEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;

  // Either a single set of rules to be applied to all resources or a mapping of resource to rules
  rules: SourceFile | RulesConfig[];

  auto_download?: boolean;
}

export class StorageEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;
  private _app?: express.Express;

  private _logger = EmulatorLogger.forEmulator(Emulators.STORAGE);
  private _rulesRuntime: StorageRulesRuntime;
  private _rulesManager!: StorageRulesManager;
  private _files: Map<string, StoredFile> = new Map();
  private _buckets: Map<string, CloudStorageBucketMetadata> = new Map();
  private _cloudFunctions: StorageCloudFunctions;
  private _persistence: Persistence;
  private _uploadService: UploadService;
  private _storageLayer: StorageLayer;
  /** StorageLayer that validates requests solely based on admin credentials.  */
  private _adminStorageLayer: StorageLayer;

  constructor(private args: StorageEmulatorArgs) {
    this._rulesRuntime = new StorageRulesRuntime();
    this._rulesManager = this.createRulesManager(this.args.rules);
    this._cloudFunctions = new StorageCloudFunctions(args.projectId);
    this._persistence = new Persistence(this.getPersistenceTmpDir());
    this._uploadService = new UploadService(this._persistence);

    const createStorageLayer = (rulesValidator: FirebaseRulesValidator): StorageLayer => {
      return new StorageLayer(
        args.projectId,
        this._files,
        this._buckets,
        rulesValidator,
        getAdminCredentialValidator(),
        this._persistence,
        this._cloudFunctions,
      );
    };
    this._storageLayer = createStorageLayer(
      getFirebaseRulesValidator((resource: string) => this._rulesManager.getRuleset(resource)),
    );
    this._adminStorageLayer = createStorageLayer(getAdminOnlyFirebaseRulesValidator());
  }

  get storageLayer(): StorageLayer {
    return this._storageLayer;
  }

  get adminStorageLayer(): StorageLayer {
    return this._adminStorageLayer;
  }

  get uploadService(): UploadService {
    return this._uploadService;
  }

  get rulesManager(): StorageRulesManager {
    return this._rulesManager;
  }

  get logger(): EmulatorLogger {
    return this._logger;
  }

  reset(): void {
    this._files.clear();
    this._buckets.clear();
    this._persistence.reset(this.getPersistenceTmpDir());
    this._uploadService.reset();
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    await this._rulesRuntime.start(this.args.auto_download);
    await this._rulesManager.start();
    this._app = await createApp(this.args.projectId, this);
    const server = this._app.listen(port, host);
    this.destroyServer = utils.createDestroyer(server);
  }

  async connect(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    await this._persistence.deleteAll();
    await this._rulesRuntime.stop();
    await this._rulesManager.stop();
    return this.destroyServer ? this.destroyServer() : Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
    const port = this.args.port || Constants.getDefaultPort(Emulators.STORAGE);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.STORAGE;
  }

  getApp(): express.Express {
    return this._app!;
  }

  private createRulesManager(rules: SourceFile | RulesConfig[]): StorageRulesManager {
    return createStorageRulesManager(rules, this._rulesRuntime);
  }

  async replaceRules(rules: SourceFile | RulesConfig[]): Promise<StorageRulesIssues> {
    await this._rulesManager.stop();
    this._rulesManager = this.createRulesManager(rules);
    return this._rulesManager.start();
  }

  private getPersistenceTmpDir(): string {
    return `${tmpdir()}/firebase/storage/blobs`;
  }
}
