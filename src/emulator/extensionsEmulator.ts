import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

import * as planner from "../deploy/extensions/planner";
import { Options } from "../options";
import { getAliases, needProjectId, needProjectNumber } from "../projectUtils";
import { FirebaseError } from "../error";
import { toExtensionVersionRef } from "../extensions/refs";
import { downloadExtensionVersion } from "./download";
import { EmulatableBackend } from "./functionsEmulator";
import { getExtensionFunctionInfo } from "../extensions/emulator/optionsHelper";

const CACHE_DIR =
  process.env.FIREBASE_EXTENSIONS_CACHE_PATH ||
  path.join(os.homedir(), ".cache", "firebase", "extensions");

export interface ExtensionEmulatorArgs {
  options: Options;
}
// TODO: Consider a different name, since this does not implement the EmulatorInstance interface
// Note: At the moment, this doesn't reallt seem like it needs to be a class. However, I think the
// statefulness that enables will be useful once we want to watch .env files for config changes.
export class ExtensionsEmulator {
  private want: planner.InstanceSpec[] = [];
  private options: Options;

  constructor(args: ExtensionEmulatorArgs) {
    this.options = args.options;
  }

  // readManifest checks the `extensions` section of `firebase.json` for the extension instances to emulate,
  // and the `{projectRoot}/extensions` directory for param values.
  private async readManifest(): Promise<void> {
    // TODO: Ideally, this should not error out if called with a fake projectId.
    const projectId = needProjectId(this.options);
    const projectNumber = await needProjectNumber(this.options);
    const aliases = getAliases(this.options, projectId);

    this.want = await planner.want({
      projectId,
      projectNumber,
      aliases,
      projectDir: this.options.config.projectDir,
      extensions: this.options.config.get("extensions"),
      checkLocal: true,
    });
  }

  // ensureSourceCode checks the cache for the source code for a given extension version,
  // downloads and builds it if it is not found, then returns the path to that source code.
  private async ensureSourceCode(instance: planner.InstanceSpec): Promise<string> {
    // TODO: Handle local extensions.
    if (!instance.ref) {
      throw new FirebaseError(
        `No ref found for ${instance.instanceId}. Emulating local extensions is not yet supported.`
      );
    }
    const sourceCodePath = path.join(CACHE_DIR, toExtensionVersionRef(instance.ref));

    // Check if something is at the cache location already. If so, assume its the extension source code!
    // TODO: Add some better sanity checking that it is the extension source code & was successfully downloaded.
    if (!fs.existsSync(sourceCodePath)) {
      const extensionVersion = await planner.getExtensionVersion(instance);
      await downloadExtensionVersion(
        toExtensionVersionRef(instance.ref),
        extensionVersion.sourceDownloadUri,
        sourceCodePath
      );
      this.installAndBuildSourceCode(sourceCodePath);
    }
    return sourceCodePath;
  }

  private installAndBuildSourceCode(sourceCodePath: string): void {
    const npmInstall = spawnSync("npm", ["--prefix", `/${sourceCodePath}/functions/`, "install"], {
      encoding: "utf8",
    });
    if (npmInstall.error) {
      throw npmInstall.error;
    }

    const npmRunBuild = spawnSync(
      "npm",
      ["--prefix", `/${sourceCodePath}/functions/`, "run", "build"],
      { encoding: "utf8" }
    );
    if (npmRunBuild.error) {
      // TODO: Make sure this does not error out if "build" is not defined, but does error if it fails otherwise.
      throw npmRunBuild.error;
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

  private async toEmulatableBackend(instance: planner.InstanceSpec): Promise<EmulatableBackend> {
    const functionsDir = await this.ensureSourceCode(instance);
    const { extensionTriggers, nodeMajorVersion } = await getExtensionFunctionInfo(
      functionsDir,
      instance.params
    );
    return {
      functionsDir,
      env: instance.params,
      predefinedTriggers: extensionTriggers,
      nodeMajorVersion: nodeMajorVersion,
      extensionInstanceId: instance.instanceId,
    };
  }
}
