import { dirname, join, relative } from "path";
import { findDependency } from "../utils";
import { gte } from "semver";
import { fileURLToPath } from "url";

const { dynamicImport } = require(true && "../../dynamicImport");

export function getBootstrapScript() {
  // `astro build` with node adapter in middleware mode will generate a middleware at entry.mjs
  // need to convert the export to `handle` to work with express integration
  return `const entry = import('./entry.mjs');\nexport const handle = async (req, res) => (await entry).handler(req, res)`;
}

export async function getConfig(cwd: string) {
  const astroDirectory = dirname(require.resolve("astro/package.json", { paths: [cwd] }));
  const version = getAstroVersion(cwd);

  let config;
  const configPath = join(astroDirectory, "dist", "core", "config", "config.js");
  if (gte(version!, "2.9.7")) {
    const { resolveConfig } = await dynamicImport(configPath);
    const { astroConfig } = await resolveConfig({ root: cwd }, "build");
    config = astroConfig;
  } else {
    const { openConfig }: typeof import("astro/dist/core/config/config") =
      await dynamicImport(configPath);
    const logging: any = undefined; // TODO figure out the types here
    const { astroConfig } = await openConfig({ cmd: "build", cwd, logging });
    config = astroConfig;
  }
  return {
    outDir: relative(cwd, fileURLToPath(config.outDir)),
    publicDir: relative(cwd, fileURLToPath(config.publicDir)),
    output: config.output,
    adapter: config.adapter,
  };
}

export function getAstroVersion(cwd: string): string | undefined {
  return findDependency("astro", { cwd, depth: 0, omitDev: false })?.version;
}
