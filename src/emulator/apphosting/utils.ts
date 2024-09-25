import { pathExists } from "fs-extra";
import { join } from "path";
import { sync as spawnSync } from "cross-spawn";

interface ProjectSetUp {
  packageManager: PackageManager;
  framework?: SupportedFramework;
}

enum PackageManager {
  npm = "npm",
  yarn = "yarn",
  pnpm = "pnpm",
}

enum SupportedFramework {
  next = "next",
  angular = "angular",
}

const NPM_ROOT_TIMEOUT_MILLIES = 5_000;
const NPM_ROOT_MEMO = new Map<string, string>();
const NPM_COMMAND_TIMEOUT_MILLIES = 10_000;

export async function discover(): Promise<ProjectSetUp> {
  const rootDir = process.cwd();
  const packageManager = await discoverPackageManager(rootDir);

  const frameworks = Object.values(SupportedFramework);
  for (let framework of frameworks) {
    const frameWorkExists = await checkForFramework(framework, packageManager);
    if (frameWorkExists) {
      return { packageManager, framework };
    }
  }

  return { packageManager };
}

async function discoverPackageManager(rootdir: string): Promise<PackageManager> {
  if (await pathExists(join(rootdir, "pnpm-lock.yaml"))) {
    return PackageManager.pnpm;
  }

  if (await pathExists(join(rootdir, "yarn.lock"))) {
    return PackageManager.yarn;
  }

  return PackageManager.npm;
}

async function checkForFramework(
  framework: SupportedFramework,
  packageManager: PackageManager,
): Promise<boolean> {
  switch (packageManager) {
    case PackageManager.npm:
      if (findNPMDependency(framework)) {
        return true;
      }
    default:
      return false;
  }
}

interface FindDepOptions {
  cwd: string;
  depth?: number;
  omitDev: boolean;
}

const DEFAULT_FIND_DEP_OPTIONS: FindDepOptions = {
  cwd: process.cwd(),
  omitDev: true,
};

export function findNPMDependency(name: string, options: Partial<FindDepOptions> = {}) {
  const { cwd: dir, depth, omitDev } = { ...DEFAULT_FIND_DEP_OPTIONS, ...options };
  const cwd = getNpmRoot(dir);
  if (!cwd) return;
  const env: any = Object.assign({}, process.env);
  delete env.NODE_ENV;
  const result = spawnSync(
    "npm",
    [
      "list",
      name,
      "--json=true",
      ...(omitDev ? ["--omit", "dev"] : []),
      ...(depth === undefined ? [] : ["--depth", depth.toString(10)]),
    ],
    { cwd, env, timeout: NPM_COMMAND_TIMEOUT_MILLIES },
  );
  if (!result.stdout) return;
  const json = JSON.parse(result.stdout.toString());
  return scanDependencyTree(name, json.dependencies);
}

function scanDependencyTree(searchingFor: string, dependencies = {}): any {
  for (const [name, dependency] of Object.entries(
    dependencies as Record<string, Record<string, any>>,
  )) {
    if (name === searchingFor) return dependency;
    const result = scanDependencyTree(searchingFor, dependency.dependencies);
    if (result) return result;
  }
  return;
}

export function getNpmRoot(cwd: string) {
  let npmRoot = NPM_ROOT_MEMO.get(cwd);
  if (npmRoot) return npmRoot;

  npmRoot = spawnSync("npm", ["root"], {
    cwd,
    timeout: NPM_ROOT_TIMEOUT_MILLIES,
  })
    .stdout?.toString()
    .trim();

  NPM_ROOT_MEMO.set(cwd, npmRoot);

  return npmRoot;
}
