import * as clc from "colorette";
import * as spawn from "cross-spawn";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
const Table = require("cli-table");

import * as planner from "../deploy/extensions/planner";
import { enableApiURI } from "../ensureApiEnabled";
import { FirebaseError } from "../error";
import { getExtensionFunctionInfo } from "../extensions/emulator/optionsHelper";
import { toExtensionVersionRef } from "../extensions/refs";
import { Options } from "../options";
import { shortenUrl } from "../shortenUrl";
import { Constants } from "./constants";
import { downloadExtensionVersion } from "./download";
import { EmulatorLogger } from "./emulatorLogger";
import { checkForUnemulatedTriggerTypes, getUnemulatedAPIs } from "./extensions/validation";
import { EmulatableBackend } from "./functionsEmulator";
import { EmulatorRegistry } from "./registry";
import { EmulatorInfo, EmulatorInstance, Emulators } from "./types";

export interface ExtensionEmulatorArgs {
  projectId: string;
  projectNumber: string;
  aliases?: string[];
  extensions: Record<string, string>;
  projectDir: string;
}

export class ExtensionsEmulator implements EmulatorInstance {
  private want: planner.DeploymentInstanceSpec[] = [];
  private backends: EmulatableBackend[] = [];
  private args: ExtensionEmulatorArgs;
  private logger = EmulatorLogger.forEmulator(Emulators.EXTENSIONS);

  // Keeps track of all the extension sources that are being downloaded.
  private pendingDownloads = new Map<string, Promise<void>>();

  constructor(args: ExtensionEmulatorArgs) {
    this.args = args;
  }

  public start(): Promise<void> {
    this.logger.logLabeled("DEBUG", "Extensions", "Started Extensions emulator, this is a noop.");
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    this.logger.logLabeled("DEBUG", "Extensions", "Stopping Extensions emulator, this is a noop.");
    return Promise.resolve();
  }

  public connect(): Promise<void> {
    this.logger.logLabeled(
      "DEBUG",
      "Extensions",
      "Connecting Extensions emulator, this is a noop.",
    );
    return Promise.resolve();
  }

  public getInfo(): EmulatorInfo {
    const functionsEmulator = EmulatorRegistry.get(Emulators.FUNCTIONS);
    if (!functionsEmulator) {
      throw new FirebaseError(
        "Extensions Emulator is running but Functions emulator is not. This should never happen.",
      );
    }
    return { ...functionsEmulator.getInfo(), name: this.getName() };
  }

  public getName(): Emulators {
    return Emulators.EXTENSIONS;
  }

  // readManifest checks the `extensions` section of `firebase.json` for the extension instances to emulate,
  // and the `{projectRoot}/extensions` directory for param values.
  private async readManifest(): Promise<void> {
    this.want = await planner.want({
      projectId: this.args.projectId,
      projectNumber: this.args.projectNumber,
      aliases: this.args.aliases ?? [],
      projectDir: this.args.projectDir,
      extensions: this.args.extensions,
      emulatorMode: true,
    });
  }

  // ensureSourceCode checks the cache for the source code for a given extension version,
  // downloads and builds it if it is not found, then returns the path to that source code.
  private async ensureSourceCode(instance: planner.InstanceSpec): Promise<string> {
    if (instance.localPath) {
      if (!this.hasValidSource({ path: instance.localPath, extTarget: instance.localPath })) {
        throw new FirebaseError(
          `Tried to emulate local extension at ${instance.localPath}, but it was missing required files.`,
        );
      }
      return path.resolve(instance.localPath);
    } else if (instance.ref) {
      const ref = toExtensionVersionRef(instance.ref);
      const cacheDir =
        process.env.FIREBASE_EXTENSIONS_CACHE_PATH ||
        path.join(os.homedir(), ".cache", "firebase", "extensions");
      const sourceCodePath = path.join(cacheDir, ref);

      // Wait for previous download promise to resolve before we check source validity.
      // This avoids racing to download the same source multiple times.
      // Note: The below will not work because it throws the thread to the back of the message queue.
      // await (this.pendingDownloads.get(ref) ?? Promise.resolve());
      if (this.pendingDownloads.get(ref)) {
        await this.pendingDownloads.get(ref);
      }

      if (!this.hasValidSource({ path: sourceCodePath, extTarget: ref })) {
        const promise = this.downloadSource(instance, ref, sourceCodePath);
        this.pendingDownloads.set(ref, promise);
        await promise;
      }
      return sourceCodePath;
    } else {
      throw new FirebaseError(
        "Tried to emulate an extension instance without a ref or localPath. This should never happen.",
      );
    }
  }

  private async downloadSource(
    instance: planner.InstanceSpec,
    ref: string,
    sourceCodePath: string,
  ): Promise<void> {
    const extensionVersion = await planner.getExtensionVersion(instance);
    await downloadExtensionVersion(ref, extensionVersion.sourceDownloadUri, sourceCodePath);
    this.installAndBuildSourceCode(sourceCodePath);
  }

  /**
   * Returns if the source code at given path is valid.
   *
   * Checks against a list of required files or directories that need to be present.
   */
  private hasValidSource(args: { path: string; extTarget: string }): boolean {
    // TODO(lihes): Source code can technically exist in other than "functions" dir.
    // https://source.corp.google.com/piper///depot/google3/firebase/mods/go/worker/fetch_mod_source.go;l=451
    const requiredFiles = ["./extension.yaml", "./functions/package.json"];
    // If the directory isn't found, no need to check for files or print errors.
    if (!fs.existsSync(args.path)) {
      return false;
    }
    for (const requiredFile of requiredFiles) {
      const f = path.join(args.path, requiredFile);
      if (!fs.existsSync(f)) {
        this.logger.logLabeled(
          "BULLET",
          "extensions",
          `Detected invalid source code for ${args.extTarget}, expected to find ${f}`,
        );
        return false;
      }
    }
    this.logger.logLabeled("DEBUG", "extensions", `Source code valid for ${args.extTarget}`);
    return true;
  }

  installAndBuildSourceCode(sourceCodePath: string): void {
    // TODO: Add logging during this so it is clear what is happening.
    this.logger.logLabeled("DEBUG", "Extensions", `Running "npm install" for ${sourceCodePath}`);
    const functionsDirectory = path.resolve(sourceCodePath, "functions");
    const npmInstall = spawn.sync("npm", ["install"], {
      encoding: "utf8",
      cwd: functionsDirectory,
    });
    if (npmInstall.error) {
      throw npmInstall.error;
    }
    this.logger.logLabeled("DEBUG", "Extensions", `Finished "npm install" for ${sourceCodePath}`);

    this.logger.logLabeled(
      "DEBUG",
      "Extensions",
      `Running "npm run gcp-build" for ${sourceCodePath}`,
    );
    const npmRunGCPBuild = spawn.sync("npm", ["run", "gcp-build"], {
      encoding: "utf8",
      cwd: functionsDirectory,
    });
    if (npmRunGCPBuild.error) {
      // TODO: Make sure this does not error out if "gcp-build" is not defined, but does error if it fails otherwise.
      throw npmRunGCPBuild.error;
    }

    this.logger.logLabeled(
      "DEBUG",
      "Extensions",
      `Finished "npm run gcp-build" for ${sourceCodePath}`,
    );
  }

  /**
   *  getEmulatableBackends reads firebase.json & .env files for a list of extension instances to emulate,
   *  downloads & builds the necessary source code (if it hasn't previously been cached),
   *  then builds returns a list of emulatableBackends
   *  @return A list of emulatableBackends, one for each extension instance to be emulated
   */
  public async getExtensionBackends(): Promise<EmulatableBackend[]> {
    await this.readManifest();
    await this.checkAndWarnAPIs(this.want);
    this.backends = await Promise.all(
      this.want.map((i: planner.DeploymentInstanceSpec) => {
        return this.toEmulatableBackend(i);
      }),
    );
    return this.backends;
  }

  /**
   * toEmulatableBackend turns a InstanceSpec into an EmulatableBackend which can be run by the Functions emulator.
   * It is exported for testing.
   */
  public async toEmulatableBackend(
    instance: planner.DeploymentInstanceSpec,
  ): Promise<EmulatableBackend> {
    const extensionDir = await this.ensureSourceCode(instance);

    // TODO: This should find package.json, then use that as functionsDir.
    const functionsDir = path.join(extensionDir, "functions");
    // TODO(b/213335255): For local extensions, this should include extensionSpec instead of extensionVersion
    const env = Object.assign(this.autoPopulatedParams(instance), instance.params);

    const { extensionTriggers, runtime, nonSecretEnv, secretEnvVariables } =
      await getExtensionFunctionInfo(instance, env);
    const emulatableBackend: EmulatableBackend = {
      functionsDir,
      runtime,
      bin: process.execPath,
      env: nonSecretEnv,
      codebase: instance.instanceId, // Give each extension its own codebase name so that they don't share workerPools.
      secretEnv: secretEnvVariables,
      predefinedTriggers: extensionTriggers,
      extensionInstanceId: instance.instanceId,
    };
    if (instance.ref) {
      emulatableBackend.extension = await planner.getExtension(instance);
      emulatableBackend.extensionVersion = await planner.getExtensionVersion(instance);
    } else if (instance.localPath) {
      emulatableBackend.extensionSpec = await planner.getExtensionSpec(instance);
    }

    return emulatableBackend;
  }

  private autoPopulatedParams(instance: planner.DeploymentInstanceSpec): Record<string, string> {
    const projectId = this.args.projectId;
    return {
      PROJECT_ID: projectId ?? "", // TODO: Should this fallback to a default?
      EXT_INSTANCE_ID: instance.instanceId,
      DATABASE_INSTANCE: projectId ?? "",
      DATABASE_URL: `https://${projectId}.firebaseio.com`,
      STORAGE_BUCKET: `${projectId}.appspot.com`,
      ALLOWED_EVENT_TYPES: instance.allowedEventTypes ? instance.allowedEventTypes.join(",") : "",
      EVENTARC_CHANNEL: instance.eventarcChannel ?? "",
      EVENTARC_CLOUD_EVENT_SOURCE: `projects/${projectId}/instances/${instance.instanceId}`,
    };
  }

  private async checkAndWarnAPIs(instances: planner.InstanceSpec[]): Promise<void> {
    const apisToWarn = await getUnemulatedAPIs(this.args.projectId, instances);
    if (apisToWarn.length) {
      const table = new Table({
        head: [
          "API Name",
          "Instances using this API",
          `Enabled on ${this.args.projectId}`,
          `Enable this API`,
        ],
        style: { head: ["yellow"] },
      });
      for (const apiToWarn of apisToWarn) {
        // We use a shortened link here instead of a alias because cli-table behaves poorly with aliased links
        const enablementUri = await shortenUrl(
          enableApiURI(this.args.projectId, apiToWarn.apiName),
        );
        table.push([
          apiToWarn.apiName,
          apiToWarn.instanceIds,
          apiToWarn.enabled ? "Yes" : "No",
          apiToWarn.enabled ? "" : clc.bold(clc.underline(enablementUri)),
        ]);
      }
      if (Constants.isDemoProject(this.args.projectId)) {
        this.logger.logLabeled(
          "WARN",
          "Extensions",
          "The following Extensions make calls to Google Cloud APIs that do not have Emulators. " +
            `${clc.bold(
              this.args.projectId,
            )} is a demo project, so these Extensions may not work as expected.\n` +
            table.toString(),
        );
      } else {
        this.logger.logLabeled(
          "WARN",
          "Extensions",
          "The following Extensions make calls to Google Cloud APIs that do not have Emulators. " +
            `These calls will go to production Google Cloud APIs which may have real effects on ${clc.bold(
              this.args.projectId,
            )}.\n` +
            table.toString(),
        );
      }
    }
  }

  /**
   * Filters out Extension backends that include any unemulated triggers.
   * @param backends a list of backends to filter
   * @return a list of backends that include only emulated triggers.
   */
  public filterUnemulatedTriggers(
    options: Options,
    backends: EmulatableBackend[],
  ): EmulatableBackend[] {
    let foundUnemulatedTrigger = false;
    const filteredBackends = backends.filter((backend) => {
      const unemulatedServices = checkForUnemulatedTriggerTypes(backend, options);
      if (unemulatedServices.length) {
        foundUnemulatedTrigger = true;
        const msg = ` ignored becuase it includes ${unemulatedServices.join(
          ", ",
        )} triggered functions, and the ${unemulatedServices.join(
          ", ",
        )} emulator does not exist or is not running.`;
        this.logger.logLabeled("WARN", `extensions[${backend.extensionInstanceId}]`, msg);
      }
      return unemulatedServices.length === 0;
    });
    if (foundUnemulatedTrigger) {
      const msg =
        "No Cloud Functions for these instances will be emulated, because partially emulating an Extension can lead to unexpected behavior. ";
      // TODO(joehanley): "To partially emulate these Extension instance anyway, rerun this command with --force";
      this.logger.log("WARN", msg);
    }
    return filteredBackends;
  }

  private extensionDetailsUILink(backend: EmulatableBackend): string {
    if (!EmulatorRegistry.isRunning(Emulators.UI) || !backend.extensionInstanceId) {
      // If the Emulator UI is not running, or if this is not an Extension backend, return an empty string
      return "";
    }
    const uiUrl = EmulatorRegistry.url(Emulators.UI);
    uiUrl.pathname = `/${Emulators.EXTENSIONS}/${backend.extensionInstanceId}`;
    return clc.underline(clc.bold(uiUrl.toString()));
  }

  public extensionsInfoTable(options: Options): string {
    const filtedBackends = this.filterUnemulatedTriggers(options, this.backends);
    const uiRunning = EmulatorRegistry.isRunning(Emulators.UI);
    const tableHead = ["Extension Instance Name", "Extension Ref"];
    if (uiRunning) {
      tableHead.push("View in Emulator UI");
    }
    const table = new Table({ head: tableHead, style: { head: ["yellow"] } });
    for (const b of filtedBackends) {
      if (b.extensionInstanceId) {
        const tableEntry = [b.extensionInstanceId, b.extensionVersion?.ref || "Local Extension"];
        if (uiRunning) tableEntry.push(this.extensionDetailsUILink(b));
        table.push(tableEntry);
      }
    }
    return table.toString();
  }
}
