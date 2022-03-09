import { tmpdir } from "os";
import * as utils from "../../utils";
import { Constants } from "../constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { createApp } from "./server";
import { StorageLayer } from "./files";
import { EmulatorLogger } from "../emulatorLogger";
import { StorageRulesManager } from "./rules/manager";
import { StorageRulesetInstance, StorageRulesRuntime, StorageRulesIssues } from "./rules/runtime";
import { SourceFile } from "./rules/types";
import express = require("express");
import {
  getAdminCredentialValidator,
  getAdminOnlyRulesValidator,
  getRulesValidator,
} from "./rules/utils";
import { Persistence } from "./persistence";
import { UploadService } from "./upload";

export interface StorageEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
  rules: SourceFile | string;
  auto_download?: boolean;
}

export class StorageEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;
  private _app?: express.Express;

  private _logger = EmulatorLogger.forEmulator(Emulators.STORAGE);
  private _rulesRuntime: StorageRulesRuntime;
  private _rulesManager: StorageRulesManager;
  private _persistence: Persistence;
  private _storageLayer: StorageLayer;
  /** StorageLayer that validates requests solely based on admin credentials.  */
  private _adminStorageLayer: StorageLayer;
  private _uploadService: UploadService;

  constructor(private args: StorageEmulatorArgs) {
    this._rulesRuntime = new StorageRulesRuntime();
    this._rulesManager = new StorageRulesManager(this._rulesRuntime);
    this._persistence = new Persistence(this.getPersistenceTmpDir());
    this._storageLayer = new StorageLayer(
      args.projectId,
      getRulesValidator(() => this.rules),
      getAdminCredentialValidator(),
      this._persistence
    );
    this._adminStorageLayer = new StorageLayer(
      args.projectId,
      getAdminOnlyRulesValidator(),
      getAdminCredentialValidator(),
      this._persistence
    );
    this._uploadService = new UploadService(this._persistence);
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
    this._storageLayer.reset();
    this._persistence.reset(this.getPersistenceTmpDir());
    this._uploadService.reset();
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    await this._rulesRuntime.start(this.args.auto_download);
    await this._rulesManager.setSourceFile(this.args.rules);
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
    await this.storageLayer.deleteAll();
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
