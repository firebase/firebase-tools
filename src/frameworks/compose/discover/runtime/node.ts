import { readOrNull } from "../filesystem";
import { FileSystem, FrameworkSpec, Runtime } from "../types";
import { RuntimeSpec } from "../types";
import { frameworkMatcher } from "../frameworkMatcher";
import { LifecycleCommands } from "../types";
import { Command } from "../types";
import { join } from "path";
import { logger } from "../../../../logger";
import { FirebaseError } from "../../../../error";

export interface PackageJSON {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
}

const NODE_LATEST_BASE_IMAGE = "node:18-slim";
const NODE_RUNTIME_ID = "nodejs";
const PACKAGE_JSON = "package.json";
const PACKAGE_LOCK_JSON = "package-lock.json";
const YARN = "yarn";
const YARN_LOCK = "yarn.lock";
const NPM = "npm";

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

  getNodeImage(version: Record<string, string> | undefined): string {
    try {
      // If no version is mentioned explicitly, assuming application is compatible with latest version.
      if (!version) {
        return NODE_LATEST_BASE_IMAGE;
      }
      const nodeVersion = version.node;
      // Splits version number `>=18..0.5` to `>=` and `18.0.5`
      const versionPattern = /^([>=<^~]+)?(\d+\.\d+\.\d+)$/;
      const versionMatch = versionPattern.exec(nodeVersion);
      if (!versionMatch) {
        return NODE_LATEST_BASE_IMAGE;
      }
      const operator = versionMatch[1];
      const versionNumber = versionMatch[2];
      const majorVersion = parseInt(versionNumber.split(".")[0]);
      if ((!operator || operator === "^" || operator === "~") && majorVersion < 18) {
        throw new FirebaseError(
          "Unsupported node version number, only versions >= 18 are supported."
        );
      }

      return NODE_LATEST_BASE_IMAGE;
    } catch (error) {
      logger.error("Failed to getNodeVersion", error);
      throw error;
    }
  }

  async getPackageManager(fs: FileSystem): Promise<string> {
    if (await fs.exists(YARN_LOCK)) {
      return YARN;
    }
    return NPM;
  }

  async getDependenciesForNPM(
    fs: FileSystem,
    packageJSON: PackageJSON
  ): Promise<Record<string, string>> {
    const directDependencies = { ...packageJSON.dependencies, ...packageJSON.devDependencies };
    let transitiveDependencies = {};

    const packageLockJSONRaw = await readOrNull(fs, PACKAGE_LOCK_JSON);
    if (!packageLockJSONRaw) {
      return directDependencies;
    }
    const packageLockJSON = JSON.parse(packageLockJSONRaw);
    const directDependencyNames = Object.keys(directDependencies).map((x) =>
      join("node_modules", x)
    );

    directDependencyNames.forEach((directDepName) => {
      const transitiveDeps = packageLockJSON.packages[directDepName].dependencies;
      transitiveDependencies = { ...transitiveDependencies, ...transitiveDeps };
    });

    return { ...directDependencies, ...transitiveDependencies };
  }

  async getDependencies(
    fs: FileSystem,
    packageJSON: PackageJSON,
    packageManager: string
  ): Promise<Record<string, string>> {
    try {
      let dependencies = {};
      if (packageManager === NPM) {
        dependencies = await this.getDependenciesForNPM(fs, packageJSON);
      }

      return dependencies;
    } catch (error: any) {
      logger.error("Failed to getDependencies for the project: ", error);
      throw error;
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
      return "yarn install";
    }

    return undefined;
  }

  detectedCommands(
    packageManager: string,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null
  ): LifecycleCommands {
    const commands: LifecycleCommands = {
      build: this.getBuildCommand(packageManager, scripts, matchedFramework),
      dev: this.getDevCommand(packageManager, scripts, matchedFramework),
      run: this.getRunCommand(packageManager, scripts, matchedFramework),
    };

    return commands;
  }

  // Converts the prefix of command to required packageManager.
  // Ex: If packageManager is 'yarn' then converts `npm run build` to `yarn run build`.
  replaceCommandPrefixWithPackageManager(command: Command, packageManager: string): Command {
    if (command.cmd !== "") {
      if (Array.isArray(command.cmd)) {
        command.cmd.map((currCmd) => currCmd.replace(/^\S+/, packageManager));
      } else {
        command.cmd.replace(/^\S+/, packageManager);
      }
    }

    return command;
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
    buildCommand = this.replaceCommandPrefixWithPackageManager(buildCommand, packageManager);

    return buildCommand;
  }

  getDevCommand(
    packageManager: string,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null
  ): Command {
    let devCommand: Command = { cmd: "", env: { NODE_ENV: "dev" } };
    if (scripts?.dev) {
      devCommand.cmd = scripts.dev;
    } else if (matchedFramework && matchedFramework.commands?.dev) {
      devCommand = matchedFramework.commands.dev;
    }
    devCommand = this.replaceCommandPrefixWithPackageManager(devCommand, packageManager);

    return devCommand;
  }

  getRunCommand(
    packageManager: string,
    scripts: Record<string, string> | undefined,
    matchedFramework: FrameworkSpec | null
  ): Command {
    let runCommand: Command = { cmd: "", env: { NODE_ENV: "production" } };
    if (scripts?.start) {
      runCommand.cmd = scripts.start;
    } else if (matchedFramework && matchedFramework.commands?.run) {
      runCommand = matchedFramework.commands.run;
    }
    runCommand = this.replaceCommandPrefixWithPackageManager(runCommand, packageManager);

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
      const dependencies = await this.getDependencies(fs, packageJSON, packageManager);
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
      logger.error("Failed to analyseCodebase: ", error);
      throw error;
    }
  }
}
