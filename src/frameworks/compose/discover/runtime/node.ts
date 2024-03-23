import { readOrNull } from "../filesystem";
import { FileSystem, FrameworkSpec, Runtime } from "../types";
import { RuntimeSpec } from "../types";
import { frameworkMatcher } from "../frameworkMatcher";
import { LifecycleCommands } from "../types";
import { Command } from "../types";
import { FirebaseError } from "../../../../error";
import { logger } from "../../../../logger";
import { conjoinOptions } from "../../../utils";

export interface PackageJSON {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
}
type PackageManager = "npm" | "yarn";

const supportedNodeVersions: string[] = ["18"];
const NODE_RUNTIME_ID = "nodejs";
const PACKAGE_JSON = "package.json";
const YARN_LOCK = "yarn.lock";

export class NodejsRuntime implements Runtime {
  private readonly runtimeRequiredFiles: string[] = [PACKAGE_JSON];

  // Checks if the codebase is using Node as runtime.
  async match(fs: FileSystem): Promise<boolean | null> {
    const areAllFilesPresent = await Promise.all(
      this.runtimeRequiredFiles.map((file) => fs.exists(file)),
    );

    return areAllFilesPresent.every((present) => present);
  }

  getRuntimeName(): string {
    return NODE_RUNTIME_ID;
  }

  getNodeImage(engine: Record<string, string> | undefined): string {
    // If no version is mentioned explicitly, assuming application is compatible with latest version.
    if (!engine || !engine.node) {
      return "us-docker.pkg.dev/firestack-build/test/run";
    }
    const versionNumber = engine.node;

    if (!supportedNodeVersions.includes(versionNumber)) {
      throw new FirebaseError(
        `This integration expects Node version ${conjoinOptions(
          supportedNodeVersions,
          "or",
        )}. You're running version ${versionNumber}, which is not compatible.`,
      );
    }

    return "us-docker.pkg.dev/firestack-build/test/run";
  }

  async getPackageManager(fs: FileSystem): Promise<PackageManager> {
    try {
      if (await fs.exists(YARN_LOCK)) {
        return "yarn";
      }

      return "npm";
    } catch (error: any) {
      logger.error("Failed to check files to identify package manager");
      throw error;
    }
  }

  getDependencies(packageJSON: PackageJSON): Record<string, string> {
    return { ...packageJSON.dependencies, ...packageJSON.devDependencies };
  }

  packageManagerInstallCommand(packageManager: PackageManager): string | undefined {
    const packages: string[] = [];
    if (packageManager === "yarn") {
      packages.push("yarn");
    }
    if (!packages.length) {
      return undefined;
    }

    return `npm install --global ${packages.join(" ")}`;
  }

  installCommand(fs: FileSystem, packageManager: PackageManager): string {
    let installCmd = "npm install";

    if (packageManager === "yarn") {
      installCmd = "yarn install";
    }

    return installCmd;
  }

  async detectedCommands(
    packageManager: PackageManager,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null,
    fs: FileSystem,
  ): Promise<LifecycleCommands> {
    return {
      build: this.getBuildCommand(packageManager, scripts, matchedFramework),
      dev: this.getDevCommand(packageManager, scripts, matchedFramework),
      run: await this.getRunCommand(packageManager, scripts, matchedFramework, fs),
    };
  }

  executeScript(packageManager: string, scriptName: string): string {
    return `${packageManager} run ${scriptName}`;
  }

  executeFrameworkCommand(packageManager: PackageManager, command: Command): Command {
    if (packageManager === "npm" || packageManager === "yarn") {
      command.cmd = "npx " + command.cmd;
    }

    return command;
  }

  getBuildCommand(
    packageManager: PackageManager,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null,
  ): Command | undefined {
    let buildCommand: Command = { cmd: "" };
    if (scripts?.build) {
      buildCommand.cmd = this.executeScript(packageManager, "build");
    } else if (matchedFramework && matchedFramework.commands?.build) {
      buildCommand = matchedFramework.commands.build;
      buildCommand = this.executeFrameworkCommand(packageManager, buildCommand);
    }

    return buildCommand.cmd === "" ? undefined : buildCommand;
  }

  getDevCommand(
    packageManager: PackageManager,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null,
  ): Command | undefined {
    let devCommand: Command = { cmd: "", env: { NODE_ENV: "dev" } };
    if (scripts?.dev) {
      devCommand.cmd = this.executeScript(packageManager, "dev");
    } else if (matchedFramework && matchedFramework.commands?.dev) {
      devCommand = matchedFramework.commands.dev;
      devCommand = this.executeFrameworkCommand(packageManager, devCommand);
    }

    return devCommand.cmd === "" ? undefined : devCommand;
  }

  async getRunCommand(
    packageManager: PackageManager,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null,
    fs: FileSystem,
  ): Promise<Command | undefined> {
    let runCommand: Command = { cmd: "", env: { NODE_ENV: "production" } };
    if (scripts?.start) {
      runCommand.cmd = this.executeScript(packageManager, "start");
    } else if (matchedFramework && matchedFramework.commands?.run) {
      runCommand = matchedFramework.commands.run;
      runCommand = this.executeFrameworkCommand(packageManager, runCommand);
    } else if (scripts?.main) {
      runCommand.cmd = `node ${scripts.main}`;
    } else if (await fs.exists("index.js")) {
      runCommand.cmd = `node index.js`;
    }

    return runCommand.cmd === "" ? undefined : runCommand;
  }

  async analyseCodebase(fs: FileSystem, allFrameworkSpecs: FrameworkSpec[]): Promise<RuntimeSpec> {
    try {
      const packageJSONRaw = await readOrNull(fs, PACKAGE_JSON);
      let packageJSON: PackageJSON = {};
      if (packageJSONRaw) {
        packageJSON = JSON.parse(packageJSONRaw) as PackageJSON;
      }
      const packageManager = await this.getPackageManager(fs);
      const nodeImage = this.getNodeImage(packageJSON.engines);
      const dependencies = this.getDependencies(packageJSON);
      const matchedFramework = await frameworkMatcher(
        NODE_RUNTIME_ID,
        fs,
        allFrameworkSpecs,
        dependencies,
      );

      const runtimeSpec: RuntimeSpec = {
        id: NODE_RUNTIME_ID,
        baseImage: nodeImage,
        packageManagerInstallCommand: this.packageManagerInstallCommand(packageManager),
        installCommand: this.installCommand(fs, packageManager),
        detectedCommands: await this.detectedCommands(
          packageManager,
          packageJSON.scripts,
          matchedFramework,
          fs,
        ),
      };

      return runtimeSpec;
    } catch (error: any) {
      throw new FirebaseError(`Failed to parse engine: ${error}`);
    }
  }
}
