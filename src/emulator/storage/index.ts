import { tmpdir } from "os";
import * as utils from "../../utils";
import { Constants } from "../constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { createApp } from "./server";
import { StorageLayer, StoredFile } from "./files";
import { EmulatorLogger } from "../emulatorLogger";
import { StorageRulesManager } from "./rules/manager";
import { StorageRulesetInstance, StorageRulesRuntime, StorageRulesIssues } from "./rules/runtime";
import { SourceFile } from "./rules/types";
import express = require("express");
import {
  getAdminCredentialValidator,
  getAdminOnlyRulesValidator,
  getRulesValidator,
  RulesValidator,
} from "./rules/utils";
import { Persistence } from "./persistence";
import { UploadService } from "./upload";
import { CloudStorageBucketMetadata } from "./metadata";
import { StorageCloudFunctions } from "./cloudFunctions";

export type RulesConfig = {
  resource: string;
  rules: string;
};

export interface StorageEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
  rules: RulesConfig[];
  auto_download?: boolean;
}

export class StorageEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;
  private _app?: express.Express;

  private _logger = EmulatorLogger.forEmulator(Emulators.STORAGE);
  private _rulesRuntime: StorageRulesRuntime;
  private _rulesManager: StorageRulesManager;
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
    this._rulesManager = new StorageRulesManager(this._rulesRuntime);
    this._cloudFunctions = new StorageCloudFunctions(args.projectId);
    this._persistence = new Persistence(this.getPersistenceTmpDir());
    this._uploadService = new UploadService(this._persistence);

    const createStorageLayer = (rulesValidator: RulesValidator): StorageLayer => {
      return new StorageLayer(
        args.projectId,
        this._files,
        this._buckets,
        rulesValidator,
        getAdminCredentialValidator(),
        this._persistence,
        this._cloudFunctions
      );
    };
    this._storageLayer = createStorageLayer(getRulesValidator(() => this.rules));
    this._adminStorageLayer = createStorageLayer(getAdminOnlyRulesValidator());
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

  get rules(): StorageRulesetInstance | undefined {
    return this._rulesManager.ruleset;
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

    // TODO(hsinpei): set source file for multiple resources
    await this._rulesManager.setSourceFile(this.args.rules[0].rules);
    this._app = await createApp(this.args.projectId, this);
    const server = this._app.listen(port, host);
    this.destroyServer = utils.createDestroyer(server);
  }

  async connect(): Promise<void> {
    // No-op
  }

  async setRules(rules: SourceFile): Promise<StorageRulesIssues> {
    return this._rulesManager.setSourceFile(rules);
  }

  async stop(): Promise<void> {
    await this._persistence.deleteAll();
    await this._rulesManager.close();
    return this.destroyServer ? this.destroyServer() : Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.STORAGE);
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

  private getPersistenceTmpDir(): string {
    return `${tmpdir()}/firebase/storage/blobs`;
  }
}
