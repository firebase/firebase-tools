import { dirname, join, relative } from "path";

const { dynamicImport } = require(true && "../../dynamicImport");

export function getBootstrapScript() {
  // `astro build` with node adapter in middleware mode will generate a middleware at entry.mjs
  // need to convert the export to `handle` to work with express integration
  return `const entry = import('./entry.mjs');\nexport const handle = async (req, res) => (await entry).handler(req, res)`;
}

export async function getConfig(cwd: string) {
  const astroDirectory = dirname(require.resolve("astro/package.json", { paths: [cwd] }));
  const { openConfig }: typeof import("astro/dist/core/config/config") = await dynamicImport(
    join(astroDirectory, "dist", "core", "config", "config.js")
  );
  const logging: any = undefined; // TODO figure out the types here
  const { astroConfig: config } = await openConfig({ cmd: "build", cwd, logging });
  const outDirPath = config.outDir.pathname.startsWith("/")
    ? config.outDir.pathname.substring(1)
    : config.outDir.pathname;
  const PublicDirPath = config.publicDir.pathname.startsWith("/")
    ? config.publicDir.pathname.substring(1)
    : config.publicDir.pathname;
  return {
    outDir: relative(cwd, outDirPath),
    publicDir: relative(cwd, PublicDirPath),
    output: config.output,
    adapter: config.adapter,
  };
}
