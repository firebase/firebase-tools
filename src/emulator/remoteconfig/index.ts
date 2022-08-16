import * as utils from "../../utils";
import { Constants } from "../constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { createApp } from "./server";
import { EmulatorLogger } from "../emulatorLogger";
import express = require("express");
import * as fs from "fs";
import { FirebaseError } from "../../error";
import * as chokidar from "chokidar";
import { cloneDeep } from "lodash";
import { RemoteConfigCloudFunctions } from "./cloudFunctions";

export interface RemoteConfigEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
  template: Source | string;
}

export interface Source {
  files: SourceFile[];
}

export interface SourceFile {
  name: string;
  content: string;
}

export interface ValidTemplate {
  valid: boolean;
  msg: string;
}

export class RemoteConfigEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;
  private _app?: express.Express;
  private _templateWatcher?: chokidar.FSWatcher;
  private _templateSource?: Source;
  private _emulatorTemplate?: any;
  private _cloudFunctions: RemoteConfigCloudFunctions;

  private _logger = EmulatorLogger.forEmulator(Emulators.REMOTE_CONFIG);

  constructor(private args: RemoteConfigEmulatorArgs) {
    this._cloudFunctions = new RemoteConfigCloudFunctions(args.projectId);
  }

  get logger(): EmulatorLogger {
    return this._logger;
  }

  get template(): any {
    return this._emulatorTemplate;
  }

  set template(newTemplate: any) {
    this._emulatorTemplate = newTemplate;
    this._cloudFunctions.dispatch("update", {
      description: "Emulator template updated.",
      updateOrigin: "REMOTE_CONFIG_UPDATE_ORIGIN_UNSPECIFIED",
      updateTime: new Date().toISOString(),
      updateType: "REMOTE_CONFIG_UPDATE_TYPE_UNSPECIFIED",
      updateUser: {
        email: "emulator@example.com",
      },
      versionNumber: 1,
    });
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    this._logger.logLabeled("BULLET", "remote config", `Emulator loading...`);

    this._app = await createApp(this.args.projectId, this);

    if (typeof this.args.template === "string") {
      const templateFile = this.args.template;
      this.updateTemplateSource(templateFile);
    } else {
      this._templateSource = this.args.template;
    }

    if (!this._templateSource || this._templateSource.files.length === 0) {
      throw new FirebaseError(
        "Can not initialize Remote Config emulator without a template source / file."
      );
    } else if (this._templateSource.files.length > 1) {
      throw new FirebaseError(
        "Can not initialize Remote Config emulator with more than one template source / file."
      );
    }

    this.loadTemplate(this._templateSource);

    const templatePath = this._templateSource.files[0].name;
    this._templateWatcher = chokidar.watch(templatePath, { persistent: true, ignoreInitial: true });
    this._templateWatcher.on("change", async () => {
      // There have been some race conditions reported (on Windows) where reading the
      // file too quickly after the watcher fires results in an empty file being read.
      // Adding a small delay prevents that at very little cost.
      await new Promise((res) => setTimeout(res, 5));

      this._logger.logLabeled(
        "BULLET",
        "remoteconfig",
        `Change detected, updating template for Remote Config...`
      );
      this.updateTemplateSource(templatePath);
      this.loadTemplate(this._templateSource);
    });

    const server = this._app.listen(port, host);
    this.destroyServer = utils.createDestroyer(server);
  }

  public loadTemplate(source?: Source): void {
    if (!source) {
      source = this._templateSource;
    }
    // TODO(kroikie): validate template before using it.
    this._emulatorTemplate = RemoteConfigEmulator.prepareEmulatorTemplate(
      JSON.parse(source!.files[0].content)
    );
  }

  /**
   * Update incoming template to be used by the emulator server.
   * If necessary `!isEmulator` conditional values are added to
   * each parameter.
   *
   * @param template A valid remote config template.
   */
  static prepareEmulatorTemplate(template: any): any {
    const emulatorTemplate = cloneDeep(template);
    const emulatorParameters = emulatorTemplate["parameters"] || {};
    for (const parameterName of Object.keys(emulatorParameters)) {
      const emulatorParameter = emulatorParameters[parameterName];
      if (emulatorParameter.hasOwnProperty("conditionalValues")) {
        // add is_emulator
        const conditionalValues = emulatorParameter["conditionalValues"];
        if (!conditionalValues.hasOwnProperty("!isEmulator")) {
          conditionalValues["!isEmulator"] = Object.assign({}, emulatorParameter["defaultValue"]);
        }
      } else {
        // add conditional value object
        emulatorParameter["conditionalValues"] = {
          // add is_emulator
          "!isEmulator": Object.assign({}, emulatorParameter["defaultValue"]),
        };
      }
      emulatorParameters[parameterName] = emulatorParameter;
    }
    return emulatorTemplate;
  }

  /**
   * Checks if the given RemoteConfigTemplate object is a valid emulator update.
   * The object must be a valid Remote Config template and have valid !isEmulator values.
   *
   * @param {any} template A RemoteConfigTemplate object to be validated.
   *
   * @returns {any} Object indicating the validity of template.
   * The returned object contains two parameters `valid` and `msg`. `valid` is true if
   * the template is valid and false otherwise. `msg` describes the reason for the `valid`
   * value.
   */
  static validateRemoteConfigEmulatorTemplate(template: any): ValidTemplate {
    const validationResp = this.validateRemoteConfigTemplate(template);
    if (!validationResp.valid) {
      return validationResp;
    }
    const templateCopy = cloneDeep(template);
    // parameters must contain an active value
    for (const parameterName of Object.keys(templateCopy.parameters)) {
      const parameter = templateCopy.parameters[parameterName];
      if (typeof parameter.conditionalValues !== "object") {
        return {
          valid: false,
          msg: `${parameterName} does not contain valid conditionalValues`,
        };
      }
      if (typeof parameter.conditionalValues["!isEmulator"] !== "object") {
        return {
          valid: false,
          msg: `${parameterName} does not contain valid !isEmulator`,
        };
      }
      const isEmulatorValue = parameter.conditionalValues["!isEmulator"].value;
      let hasMatch = false;
      if (parameter.defaultValue.value === isEmulatorValue) {
        hasMatch = true;
      } else {
        for (const conditionalValueKey of Object.keys(parameter.conditionalValues)) {
          if (conditionalValueKey === "!isEmulator") {
            continue;
          }
          if (parameter.conditionalValues[conditionalValueKey].value === isEmulatorValue) {
            hasMatch = true;
          }
        }
      }
      if (!hasMatch) {
        return {
          valid: false,
          msg: `${parameterName}'s emulator value does not match default or conditional value`,
        };
      }
    }
    return {
      valid: true,
      msg: "template is valid",
    };
  }

  /**
   * Based on validation in Admin SDK: https://github.com/firebase/firebase-admin-node/blob/19123f816199c51734ea1e4601e3fd95106d00b4/src/remote-config/remote-config-api-client-internal.ts#L267
   *
   * Checks if the given RemoteConfigTemplate object is valid.
   * The object must have valid parameters, parameter groups, conditions, and an etag.
   *
   * @param {any} template A RemoteConfigTemplate object to be validated.
   *
   * @returns {ValidTemplate} indicating the validity of template.
   * The returned object contains two parameters `valid` and `msg`. `valid` is true if
   * the template is valid and false otherwise. `msg` describes the reason for the `valid`
   * value.
   */
  static validateRemoteConfigTemplate(template: any): ValidTemplate {
    const templateCopy = cloneDeep(template);
    if (typeof templateCopy !== "object") {
      return {
        valid: false,
        msg: "template is not an object",
      };
    }
    if (typeof templateCopy.parameters !== "object") {
      return {
        valid: false,
        msg: "template does not contain valid parameters",
      };
    }
    // TODO(b/226152522): complete template validation
    return {
      valid: true,
      msg: "template is valid",
    };
  }

  static extractEmulator(emulatorTemplate: any): any {
    const nonEmulatorTemplate = cloneDeep(emulatorTemplate);
    const emulatorParameters = nonEmulatorTemplate["parameters"] || {};
    for (const parameterName of Object.keys(emulatorParameters)) {
      const emulatorParameter = emulatorParameters[parameterName];
      const conditionalValues = emulatorParameter["conditionalValues"];
      if (Object.values(conditionalValues).length > 1) {
        delete conditionalValues["!isEmulator"];
      } else {
        delete emulatorParameter["conditionalValues"];
      }
    }
    return nonEmulatorTemplate;
  }

  private updateTemplateSource(templateFile: string): void {
    this._templateSource = {
      files: [
        {
          name: templateFile,
          content: fs.readFileSync(templateFile).toString(),
        },
      ],
    };
  }

  async connect(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    return this.destroyServer ? this.destroyServer() : Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
    const port = this.args.port || Constants.getDefaultPort(Emulators.REMOTE_CONFIG);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.REMOTE_CONFIG;
  }

  getApp(): express.Express {
    return this._app!;
  }
}
