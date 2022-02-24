import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

import * as planner from "../deploy/extensions/planner";
import { FirebaseError } from "../error";
import { toExtensionVersionRef } from "../extensions/refs";
import { downloadExtensionVersion } from "./download";
import { EmulatableBackend } from "./functionsEmulator";
import { getExtensionFunctionInfo } from "../extensions/emulator/optionsHelper";
import { EmulatorLogger } from "./emulatorLogger";
import { Emulators } from "./types";
import { getNonEmulatedAPIs } from "./extensions/utils";
import { check } from "../ensureApiEnabled";

export interface ExtensionEmulatorArgs {
  projectId: string;
  projectNumber: string;
  aliases?: string[];
  extensions: Record<string, string>;
  projectDir: string;
}
// TODO: Consider a different name, since this does not implement the EmulatorInstance interface
// Note: At the moment, this doesn't really seem like it needs to be a class. However, I think the
// statefulness that enables will be useful once we want to watch .env files for config changes.
export class ExtensionsEmulator {
  private want: planner.InstanceSpec[] = [];
  private args: ExtensionEmulatorArgs;
  private logger = EmulatorLogger.forEmulator(Emulators.EXTENSIONS);

  constructor(args: ExtensionEmulatorArgs) {
    this.args = args;
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
      checkLocal: true,
    });
  }

  // ensureSourceCode checks the cache for the source code for a given extension version,
  // downloads and builds it if it is not found, then returns the path to that source code.
  private async ensureSourceCode(instance: planner.InstanceSpec): Promise<string> {
    // TODO(b/213335255): Handle local extensions.
    if (!instance.ref) {
      throw new FirebaseError(
        `No ref found for ${instance.instanceId}. Emulating local extensions is not yet supported.`
      );
    }
    // TODO: If ref contains 'latest', we need to resolve that to a real version.

    const ref = toExtensionVersionRef(instance.ref);
    const cacheDir =
      process.env.FIREBASE_EXTENSIONS_CACHE_PATH ||
      path.join(os.homedir(), ".cache", "firebase", "extensions");
    const sourceCodePath = path.join(cacheDir, ref);

    if (!this.hasValidSource({ path: sourceCodePath, extRef: ref })) {
      const extensionVersion = await planner.getExtensionVersion(instance);
      await downloadExtensionVersion(ref, extensionVersion.sourceDownloadUri, sourceCodePath);
      this.installAndBuildSourceCode(sourceCodePath);
    }
    return sourceCodePath;
  }

  /**
   * Returns if the source code at given path is valid.
   *
   * Checks against a list of required files or directories that need to be present.
   */
  private hasValidSource(args: { path: string; extRef: string }): boolean {
    // TODO(lihes): Source code can technically exist in other than "functions" dir.
    // https://source.corp.google.com/piper///depot/google3/firebase/mods/go/worker/fetch_mod_source.go;l=451
    const requiredFiles = [
      "./extension.yaml",
      "./functions/package.json",
      "./functions/node_modules",
    ];

    for (const requiredFile of requiredFiles) {
      const f = path.join(args.path, requiredFile);
      if (!fs.existsSync(f)) {
        EmulatorLogger.forExtension({ ref: args.extRef }).logLabeled(
          "BULLET",
          "extensions",
          `Detected invalid source code for ${args.extRef}, expected to find ${f}`
        );
        return false;
      }
    }

    return true;
  }

  private installAndBuildSourceCode(sourceCodePath: string): void {
    // TODO: Add logging during this so it is clear what is happening.
    const npmInstall = spawnSync("npm", ["--prefix", `/${sourceCodePath}/functions/`, "install"], {
      encoding: "utf8",
    });
    if (npmInstall.error) {
      throw npmInstall.error;
    }

    const npmRunGCPBuild = spawnSync(
      "npm",
      ["--prefix", `/${sourceCodePath}/functions/`, "run", "gcp-build"],
      { encoding: "utf8" }
    );
    if (npmRunGCPBuild.error) {
      // TODO: Make sure this does not error out if "gcp-build" is not defined, but does error if it fails otherwise.
      throw npmRunGCPBuild.error;
    }
  }

  /**
   *  getEmulatableBackends reads firebase.json & .env files for a list of extension instances to emulate,
   *  downloads & builds the necessary source code (if it hasn't previously been cached),
   *  then builds returns a list of emulatableBackends
   *  @returns A list of emulatableBackends, one for each extension instance to be emulated
   */
  public async getExtensionBackends(): Promise<EmulatableBackend[]> {
    await this.readManifest();

    return Promise.all(
      this.want.map((i: planner.InstanceSpec) => {
        return this.toEmulatableBackend(i);
      })
    );
  }

  /**
   * toEmulatableBackend turns a InstanceSpec into an EmulatableBackend which can be run by the Functions emulator.
   * It is exported for testing.
   */
  public async toEmulatableBackend(instance: planner.InstanceSpec): Promise<EmulatableBackend> {
    const extensionDir = await this.ensureSourceCode(instance);
    // TODO: This should find package.json, then use that as functionsDir.
    const functionsDir = path.join(extensionDir, "functions");
    const env = Object.assign(this.autoPopulatedParams(instance), instance.params);
    const { extensionTriggers, nodeMajorVersion } = await getExtensionFunctionInfo(
      extensionDir,
      instance.instanceId,
      env
    );
    const extensionVersion = await planner.getExtensionVersion(instance);
    return {
      functionsDir,
      env,
      predefinedTriggers: extensionTriggers,
      nodeMajorVersion: nodeMajorVersion,
      extensionInstanceId: instance.instanceId,
      extensionVersion,
    };
  }

  private autoPopulatedParams(instance: planner.InstanceSpec): Record<string, string> {
    const projectId = this.args.projectId;
    return {
      PROJECT_ID: projectId ?? "", // TODO: Should this fallback to a default?
      EXT_INSTANCE_ID: instance.instanceId,
      DATABASE_INSTANCE: projectId ?? "",
      DATABASE_URL: `https://${projectId}.firebaseio.com`,
      STORAGE_BUCKET: `${projectId}.appspot.com`,
    };
  }

  private async checkAndWarnAPIs(instances: planner.InstanceSpec[]) {
    const apisToCheck = await getNonEmulatedAPIs(instances);
    for (const [api, instanceIds] of Object.entries(apisToCheck)) {
      const enabled = await check(this.args.projectId, api, "extensions", true);
      if (enabled) {
        this.logger.logLabeled(
          "WARN",
          "Extensions",
          `The following Extensions make calls to Google Cloud APIs that do not have Emulators. ` +
         ```These calls will affect your production project ${this.args.projectId}`
          );
      } else {

      }
    }
    
    }
  }
}
