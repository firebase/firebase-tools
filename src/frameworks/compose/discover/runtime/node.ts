import { readOrNull } from "../filesystem";
import { FileSystem, FrameworkSpec, Runtime } from "../types";
import { RuntimeSpec } from "../types";
import { frameworkMatcher } from "../frameworkMatcher";
import { LifecycleCommands } from "../types";
import { Command } from "../types";
import { join } from "path";
import { logger } from "../../../../logger";
import { FirebaseError } from "../../../../error";
import { VALID_ENGINES } from "../../../constants";
import { conjoinOptions } from "../../../utils";
export interface PackageJSON {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
}

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

  getNodeImage(engine: Record<string, string> | undefined): string {
    // If no version is mentioned explicitly, assuming application is compatible with latest version.
    if (!engine) {
      const latest = VALID_ENGINES.node[VALID_ENGINES.node.length - 1];
      return `node:${latest}-slim`;
    }
    const versionNumber = parseInt(engine.node, 10);
    const validEngines = VALID_ENGINES.node.filter((it) => it !== versionNumber);

    if (!validEngines.length) {
      throw new FirebaseError(
        `This integration expects Node version ${conjoinOptions(
          VALID_ENGINES.node,
          "or"
        )}. You're running version ${versionNumber}, which is not compatible.`
      );
    }

    return `node:${versionNumber}-slim`;
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

  async getDependenciesForYARN(
    fs: FileSystem,
    packageJSON: PackageJSON
  ): Promise<Record<string, string>> {
    const directDependencies = { ...packageJSON.dependencies, ...packageJSON.devDependencies };
    const yarnLockJSONRaw = await readOrNull(fs, YARN_LOCK);
    if (!yarnLockJSONRaw) {
      return directDependencies;
    }

    const allDependencies: any = {};
    const lines = yarnLockJSONRaw.split("\n");

    for (let line of lines) {
      line = line.trim();
      if (line.startsWith("#") || line === "") {
        continue;
      }
      const patternMatch = /^"(.+?)@(.+?)":/.exec(line);
      if (patternMatch) {
        const dependencyName = patternMatch[1];
        const version = patternMatch[2];
        allDependencies[dependencyName] = version;
      }
    }

    return allDependencies;
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
      } else if (packageManager === YARN) {
        dependencies = await this.getDependenciesForYARN(fs, packageJSON);
      }

      return dependencies;
    } catch (error: any) {
      logger.error("Error while reading dependencies for the project: ", error);
      throw error;
    }
  }

  packageManagerInstallCommand(packageManager: string): string | undefined {
    const packages: string[] = [];
    if (packageManager === YARN) {
      packages.push(YARN);
    }
    if (!packages.length) {
      return undefined;
    }

    return `npm install --global ${packages.join(" ")}`;
  }

  installCommand(packageManager: string): string | undefined {
    if (packageManager === NPM) {
      return "npm ci";
    } else if (packageManager === YARN) {
      return "yarn install";
    }

    return undefined;
  }

  detectedCommands(
    packageManager: string,
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

  executeFrameworkCommand(packageManager: string, command: Command): Command {
    if (packageManager === NPM || packageManager === YARN) {
      command.cmd = "npx " + command.cmd;
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
      buildCommand.cmd = this.executeScript(packageManager, "build");
    } else if (matchedFramework && matchedFramework.commands?.build) {
      buildCommand = matchedFramework.commands.build;
      buildCommand = this.executeFrameworkCommand(packageManager, buildCommand);
    }

    return buildCommand;
  }

  getDevCommand(
    packageManager: string,
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
    packageManager: string,
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
      throw new FirebaseError(`Failed to indentify commands for codebase: ${error}`);
    }
  }
}
