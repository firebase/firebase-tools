import { readOrNull } from "../filesystem";
import { FileSystem, FrameworkSpec, Runtime } from "../types";
import { RuntimeSpec } from "../types";
import { frameworkMatcher } from "../frameworkMatcher";
import { LifecycleCommands } from "../types";
import { Command } from "../types";
import { FirebaseError } from "../../../../error";

export interface PackageJSON {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
}
type PackageManager = "npm" | "yarn";

const supportedNodeVersion = 18;
const NODE_RUNTIME_ID = "nodejs";
const PACKAGE_JSON = "package.json";
const YARN_LOCK = "yarn.lock";

export class NodejsRuntime implements Runtime {
  private readonly runtimeRequiredFiles: string[] = [PACKAGE_JSON];
  private readonly contentCache: Record<string, boolean> = {};

  // Checks if the codebase is using Node as runtime.
  async match(fs: FileSystem): Promise<boolean | null> {
    const areAllFilesPresent = await Promise.all(
      this.runtimeRequiredFiles.map((file) => fs.exists(file))
    );

    return Promise.resolve(areAllFilesPresent.every((present) => present));
  }

  getRuntimeName(): string {
    return NODE_RUNTIME_ID;
  }

  getNodeImage(engine: Record<string, string> | undefined): string {
    // If no version is mentioned explicitly, assuming application is compatible with latest version.
    if (!engine) {
      return `node:${supportedNodeVersion}-slim`;
    }
    const versionNumber = parseInt(engine.node, 10);

    if (versionNumber !== supportedNodeVersion) {
      throw new FirebaseError(
        `This integration expects Node version ${supportedNodeVersion}. You're running version ${versionNumber}, which is not compatible.`
      );
    }

    return `node:${versionNumber}-slim`;
  }

  async getPackageManager(fs: FileSystem): Promise<PackageManager> {
    if (await fs.exists(YARN_LOCK)) {
      return "yarn";
    }

    return "npm";
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

  installCommand(packageManager: PackageManager): string | undefined {
    if (packageManager === "npm") {
      return "npm install";
    } else if (packageManager === "yarn") {
      return "yarn install";
    }

    return undefined;
  }

  detectedCommands(
    packageManager: PackageManager,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null
  ): LifecycleCommands {
    return {
      build: this.getBuildCommand(packageManager, scripts, matchedFramework),
      dev: this.getDevCommand(packageManager, scripts, matchedFramework),
      run: this.getRunCommand(packageManager, scripts, matchedFramework),
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
    matchedFramework: FrameworkSpec | null
  ): Command {
    let buildCommand: Command = { cmd: "" };
    if (scripts?.build) {
      buildCommand.cmd = this.executeScript(packageManager, "build");
    } else if (matchedFramework && matchedFramework.commands?.build) {
      buildCommand = matchedFramework.commands.build;
      buildCommand = this.executeFrameworkCommand(packageManager, buildCommand);
    }

    return buildCommand;
  }

  getDevCommand(
    packageManager: PackageManager,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null
  ): Command {
    let devCommand: Command = { cmd: "", env: { NODE_ENV: "dev" } };
    if (scripts?.dev) {
      devCommand.cmd = this.executeScript(packageManager, "dev");
    } else if (matchedFramework && matchedFramework.commands?.dev) {
      devCommand = matchedFramework.commands.dev;
      devCommand = this.executeFrameworkCommand(packageManager, devCommand);
    }

    return devCommand;
  }

  getRunCommand(
    packageManager: PackageManager,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null
  ): Command {
    let runCommand: Command = { cmd: "", env: { NODE_ENV: "production" } };
    if (scripts?.start) {
      runCommand.cmd = this.executeScript(packageManager, "start");
    } else if (matchedFramework && matchedFramework.commands?.run) {
      runCommand = matchedFramework.commands.run;
      runCommand = this.executeFrameworkCommand(packageManager, runCommand);
    }

    return runCommand;
  }

  async analyseCodebase(
    fs: FileSystem,
    allFrameworkSpecs: FrameworkSpec[]
  ): Promise<RuntimeSpec | null> {
    try {
      const packageJSONRaw = await readOrNull(fs, PACKAGE_JSON);
      if (!packageJSONRaw) {
        return null;
      }
      const packageJSON = JSON.parse(packageJSONRaw) as PackageJSON;
      const packageManager = await this.getPackageManager(fs);
      const nodeImage = this.getNodeImage(packageJSON.engines);
      const dependencies = this.getDependencies(packageJSON);
      const matchedFramework = await frameworkMatcher(
        NODE_RUNTIME_ID,
        fs,
        allFrameworkSpecs,
        dependencies
      );

      const runtimeSpec: RuntimeSpec = {
        id: NODE_RUNTIME_ID,
        baseImage: nodeImage,
        packageManagerInstallCommand: this.packageManagerInstallCommand(packageManager),
        installCommand: this.installCommand(packageManager),
        detectedCommands: this.detectedCommands(
          packageManager,
          packageJSON.scripts,
          matchedFramework
        ),
      };

      return runtimeSpec;
    } catch (error: any) {
      throw new FirebaseError(`Failed to parse engine: ${error}`);
    }
  }
}
