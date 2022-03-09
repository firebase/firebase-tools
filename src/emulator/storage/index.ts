import { tmpdir } from "os";
import * as utils from "../../utils";
import { Constants } from "../constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { createApp } from "./server";
import { StorageLayer } from "./files";
import { EmulatorLogger } from "../emulatorLogger";
import { createStorageRulesManager, StorageRulesManager } from "./rules/manager";
import { StorageRulesetInstance, StorageRulesRuntime, StorageRulesIssues } from "./rules/runtime";
import { SourceFile } from "./rules/types";
import express = require("express");
import { getAdminCredentialValidator, getRulesValidator } from "./rules/utils";
import { Persistence } from "./persistence";
import { UploadService } from "./upload";

export type RulesType = SourceFile | string;

export type RulesConfig = {
  resource: string;
  rules: RulesType;
};

export interface StorageEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
  rules: string | RulesConfig[];
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
  private _uploadService: UploadService;

  constructor(private args: StorageEmulatorArgs) {
    this._rulesRuntime = new StorageRulesRuntime();
    this._rulesManager = createStorageRulesManager(this.args.rules, this._rulesRuntime);
    this._persistence = new Persistence(this.getPersistenceTmpDir());
    this._storageLayer = new StorageLayer(
      args.projectId,
      getRulesValidator((resource: string) => this.getRules(resource)),
      getAdminCredentialValidator(),
      this._persistence
    );
    this._uploadService = new UploadService(this._persistence);
  }

  get storageLayer(): StorageLayer {
    return this._storageLayer;
  }

  get uploadService(): UploadService {
    return this._uploadService;
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
    await this._rulesManager.start();
    this._app = await createApp(this.args.projectId, this);
    const server = this._app.listen(port, host);
    this.destroyServer = utils.createDestroyer(server);
  }

  async connect(): Promise<void> {
    // No-op
  }

  getRules(resource: string): StorageRulesetInstance | undefined {
    return this._rulesManager.getRuleset(resource);
  }

  async setRules(rules: RulesType, resource: string): Promise<StorageRulesIssues> {
    return this._rulesManager.setSourceFile(rules, resource);
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
