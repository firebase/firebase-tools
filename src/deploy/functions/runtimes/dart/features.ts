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

/**
 * Detects Dart language-version-gated features for a project.
 *
 * The version used is the language version declared in the project's own pubspec.yaml
 * (`environment: sdk:`), surfaced via `.dart_tool/package_config.json` once dependencies
 * are resolved — not whichever Dart toolchain happens to be installed on the machine
 * running the build. This keeps behavior reproducible for a given project across
 * machines (a dev laptop and a CI runner build it the same way), and keeps future
 * version-gated capabilities to a single place instead of scattered comparisons.
 */
export class DartVersionFeatures {
  private constructor(private readonly languageVersion: [number, number] | undefined) {}

  /** Reads the project's declared language version from `<sourceDir>/.dart_tool/package_config.json`. */
  static async detect(sourceDir: string): Promise<DartVersionFeatures> {
    return new DartVersionFeatures(await readRootLanguageVersion(sourceDir));
  }

  /**
   * `dart build cli` supports native build hooks (native assets, e.g. packages like
   * `sqlite3`) while cross-compiling (--target-os/--target-arch) as of Dart 3.13.
   * `dart compile exe` already supports cross-compilation, but never supports native
   * build hooks at all, at any version.
   */
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

  let parsed: PackageConfig;
  try {
    parsed = JSON.parse(raw) as PackageConfig;
  } catch {
    return undefined;
  }

  const root = parsed.packages?.find((p) => p.rootUri === "../");
  const match = root?.languageVersion ? /^(\d+)\.(\d+)$/.exec(root.languageVersion) : null;
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2])];
}
