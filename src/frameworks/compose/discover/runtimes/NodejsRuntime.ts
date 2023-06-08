import { readOrNull } from "../filesystem";
import { FileSystem, FrameworkSpec, Runtime } from "../types";
import { RuntimeSpec } from "../types";
import { frameworkMatcher } from "../frameworkMatcher";
import { LifecycleCommands } from "../types";
import { Command } from "../types";
import { join } from "path";

interface PackageJSON {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines: Record<string, string>;
}

const NODE = "node";
const NODE_LATEST_BASE_IMAGE = "node:18-slim";
const NODE_RUNTIME_ID = "nodejs";
const PACKAGE_JSON = "package.json";
const PACKAGE_LOCK_JSON = "package-lock.json";
const YARN = "yarn";
const YARN_LOCK = "yarn.lock";
const NPM = "npm";

export class NodejsRuntime implements Runtime {
  private readonly runtimeName = NODE_RUNTIME_ID;
  private readonly runtimeRequiredFiles: string[] = [PACKAGE_JSON];

  async match(fs: FileSystem): Promise<boolean | null> {
    const areAllFilesPresent = await Promise.all(
      this.runtimeRequiredFiles.map((file) => fs.exists(file))
    );
    return Promise.resolve(areAllFilesPresent.every((present) => present));
  }

  getRuntimeName(): string {
    return this.runtimeName;
  }

  getNodeVersion(version: Record<string, string>): string | undefined {
    try {
      const versionPattern = /^([>=<]+)?(\d+\.\d+\.\d+)$/;
      if (!version) {
        return NODE_LATEST_BASE_IMAGE;
      }
      const nodeVersion = version[NODE];
      const versionMatch = versionPattern.exec(nodeVersion);
      if (!versionMatch) {
        return NODE_LATEST_BASE_IMAGE;
      }
      const operator = versionMatch[1];
      const versionNumber = versionMatch[2];
      const majorVersion = parseInt(versionNumber.split(".")[0]);
      if (!operator && majorVersion < 18) {
        throw new Error("Unsupported node version number");
      }

      return NODE_LATEST_BASE_IMAGE;
    } catch (error: any) {
      console.error("Failed to extractVersionNumber ", error.message);
    }
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
      // identify package manager
      const packageManager = (await fs.exists(YARN_LOCK)) ? YARN : NPM;
      // identify nodeversion
      const nodeImageVersion = this.getNodeVersion(packageJSON.engines);
      // identify depedencies
      const dependencies = await this.getDependencies(fs, packageJSON, packageManager);
      // identify the frameworkSpec
      const matchedFramework = frameworkMatcher(
        NODE_RUNTIME_ID,
        fs,
        allFrameworkSpecs,
        dependencies
      );

      if (!nodeImageVersion) {
        throw new Error("Node version used is not supported");
      }

      const runtimeSpec: RuntimeSpec = {
        id: NODE_RUNTIME_ID,
        baseImage: nodeImageVersion,
        packageManagerInstallCommand: this.packageManagerInstallCommand(packageManager),
        installCommand: this.installCommand(packageManager),
      };

      runtimeSpec.detectedCommands = this.detectedCommands(
        packageManager,
        packageJSON.scripts,
        matchedFramework
      );

      return runtimeSpec;
    } catch (error: any) {
      throw new Error("Failed to analyseCodebase", error.message);
    }
  }

  async getDependencies(fs: FileSystem, packageJSON: PackageJSON, packageManager: string) {
    try {
      let dependencies = {};
      if (packageManager === NPM) {
        const packageLockJSONRaw = await readOrNull(fs, PACKAGE_LOCK_JSON);
        if (!packageLockJSONRaw) {
          return dependencies;
        }
        const packageLockJSON = JSON.parse(packageLockJSONRaw);
        const directDependencies = { ...packageJSON.dependencies, ...packageJSON.devDependencies };
        const directDependenciesKeys = Object.keys(directDependencies).map((x) =>
          join("node_modules", x)
        );
        let transitiveDependencies = {};
        directDependenciesKeys.forEach((key) => {
          const deps = packageLockJSON.packages[key]["dependencies"];
          transitiveDependencies = { ...transitiveDependencies, ...deps };
        });
        dependencies = { ...directDependencies, ...transitiveDependencies };
      }
      return dependencies;
    } catch (error: any) {
      throw new Error("Failed to getDependencies for the project", error.message);
    }
  }

  packageManagerInstallCommand(packageManager: string): string | undefined {
    const packages: string[] = [];
    if (packageManager === "yarn") {
      packages.push("yarn");
    }
    if (!packages.length) {
      return undefined;
    }

    return `npm install --global ${packages.join(" ")}`;
  }

  installCommand(packageManager: string): string | undefined {
    if (packageManager === "npm") {
      return "npm ci";
    } else if (packageManager === "yarn") {
      return "yarn install --frozen-lockfile";
    }

    return undefined;
  }

  detectedCommands(
    packageManager: string,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null
  ): LifecycleCommands | undefined {
    const commands: LifecycleCommands = {
      build: this.getBuildCommand(packageManager, scripts, matchedFramework),
      run: this.getRunCommand(packageManager, scripts, matchedFramework),
      dev: this.getDevCommand(packageManager, scripts, matchedFramework),
    };

    return commands;
  }

  replaceWithPackageManager(command: Command, packageManager: string) {
    if (command.cmd !== "") {
      if (Array.isArray(command.cmd)) {
        command.cmd.map((currCmd) => currCmd.replace(/^\S+/, packageManager));
      } else {
        command.cmd.replace(/^\S+/, packageManager);
      }
    }
  }

  getDevCommand(
    packageManager: string,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null
  ): Command {
    let devCommand: Command = { cmd: "", env: { NODE_ENV: "dev" } };
    if (scripts?.dev) {
      devCommand.cmd = scripts.dev;
    } else if (scripts?.start) {
      devCommand.cmd = scripts.start;
    } else if (matchedFramework && matchedFramework.commands?.build) {
      devCommand = matchedFramework.commands.build;
    }
    this.replaceWithPackageManager(devCommand, packageManager);

    return devCommand;
  }

  getBuildCommand(
    packageManager: string,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null
  ): Command {
    let buildCommand: Command = { cmd: "" };
    if (scripts?.build) {
      buildCommand.cmd = scripts.build;
    } else if (matchedFramework && matchedFramework.commands?.build) {
      buildCommand = matchedFramework.commands.build;
    }
    this.replaceWithPackageManager(buildCommand, packageManager);

    return buildCommand;
  }

  getRunCommand(
    packageManager: string,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null
  ): Command {
    let runCommand: Command = { cmd: "", env: { NODE_ENV: "production" } };
    if (scripts?.run) {
      runCommand.cmd = scripts.run;
    } else if (matchedFramework && matchedFramework.commands?.run) {
      runCommand = matchedFramework.commands.run;
    }
    this.replaceWithPackageManager(runCommand, packageManager);

    return runCommand;
  }
}
