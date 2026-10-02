import * as path from "path";
import * as os from "os";
import * as fs from "fs-extra";
import { Options } from "../options";
import { SkillManifest } from "./types";
import { detectProjectRoot } from "../detectProjectRoot";
import { FirebaseError } from "../error";

const MANIFEST_FILENAME = "skills-manifest.json";
const SKILLS_DIR = ".agent/skills";

export function getManifestPath(options: Options, global?: boolean): string {
  if (global) {
    return path.join(os.homedir(), SKILLS_DIR, MANIFEST_FILENAME);
  }
  const projectRoot = detectProjectRoot(options);
  if (!projectRoot) {
    throw new FirebaseError("No Firebase project directory detected. Run this command from within a Firebase project or use --global.");
  }
  return path.join(projectRoot, SKILLS_DIR, MANIFEST_FILENAME);
}

export async function loadManifest(options: Options, global?: boolean): Promise<SkillManifest> {
  const manifestPath = getManifestPath(options, global);
  if (await fs.pathExists(manifestPath)) {
    return fs.readJson(manifestPath);
  }
  return {
    cliVersion: require("../../package.json").version,
    lastUpdateDate: new Date().toISOString(),
    skills: {},
  };
}

export async function saveManifest(options: Options, manifest: SkillManifest, global?: boolean): Promise<void> {
  const manifestPath = getManifestPath(options, global);
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeJson(manifestPath, manifest, { spaces: 2 });
}

export function getSkillsDir(options: Options, global?: boolean): string {
  if (global) {
    return path.join(os.homedir(), SKILLS_DIR);
  }
  const projectRoot = detectProjectRoot(options);
  if (!projectRoot) {
    throw new FirebaseError("No Firebase project directory detected. Run this command from within a Firebase project or use --global.");
  }
  return path.join(projectRoot, SKILLS_DIR);
}
