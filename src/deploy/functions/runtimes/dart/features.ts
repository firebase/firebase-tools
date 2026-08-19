import * as fs from "fs";
import * as path from "path";

interface PackageConfigEntry {
  name: string;
  rootUri: string;
  languageVersion?: string;
}

interface PackageConfig {
  packages?: PackageConfigEntry[];
}

/** Detects Dart language-version-gated features for a project, from its declared pubspec.yaml SDK constraint rather than the installed toolchain. */
export class DartVersionFeatures {
  private constructor(private readonly languageVersion: [number, number] | undefined) {}

  /** Reads the project's declared language version from `<sourceDir>/.dart_tool/package_config.json`. */
  static async detect(sourceDir: string): Promise<DartVersionFeatures> {
    return new DartVersionFeatures(await readRootLanguageVersion(sourceDir));
  }

  /** `dart build cli` supports native build hooks (e.g. `sqlite3`) while cross-compiling, as of Dart 3.13. */
  get isNativeAssetsAvailable(): boolean {
    return this.atLeast(3, 13);
  }

  private atLeast(major: number, minor: number): boolean {
    if (!this.languageVersion) {
      return false;
    }
    const [actualMajor, actualMinor] = this.languageVersion;
    return actualMajor > major || (actualMajor === major && actualMinor >= minor);
  }
}

async function readRootLanguageVersion(sourceDir: string): Promise<[number, number] | undefined> {
  const packageConfigPath = path.join(sourceDir, ".dart_tool", "package_config.json");
  let raw: string;
  try {
    raw = await fs.promises.readFile(packageConfigPath, "utf8");
  } catch {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as PackageConfig;
    const root = parsed?.packages?.find((p) => p.rootUri === "../");
    const match = root?.languageVersion ? /^(\d+)\.(\d+)$/.exec(root.languageVersion) : null;
    if (!match) {
      return undefined;
    }
    return [Number(match[1]), Number(match[2])];
  } catch {
    return undefined;
  }
}
