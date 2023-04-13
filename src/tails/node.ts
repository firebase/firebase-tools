import * as engine from "./engine";

// TODO: make this a JIT dynamic load from the filesystem

type PackageManager = "npm" | "yarn";
type Language = "js" | "ts-local" | "ts-global";
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, unknown>;
}

export class NodejsCodebase implements engine.Codebase {
  readonly runtimeName = "nodejs";
  readonly frameworkName: string;
  constructor(
    private readonly pkgMgr: PackageManager,
    private readonly lang: Language,
    private readonly scripts: string[],
    private readonly frameworks: engine.Framework[]
  ) {
    this.frameworkName = frameworks.length ? this.frameworks[0].name : "nodejs";
  }

  packageManagerInstallCommand(): string | null {
    const packages: string[] = [];
    if (this.pkgMgr === "yarn") {
      packages.push("yarn");
    }
    if (this.lang === "ts-global") {
      packages.push("typescript");
    }
    if (!packages.length) {
      return null;
    }

    return engine.interpolate(
      `npm install --global ${packages.join(" ")}`,
      engine.vars(this.frameworks)
    );
  }

  installCommand(): string | null {
    let npmCommand = "npm install";
    for (const framework of this.frameworks) {
      if (framework.installCommand) {
        npmCommand = framework.installCommand;
        break;
      }
    }
    if (this.pkgMgr === "yarn") {
      return npmCommand.replace(/npm i(nstall)?/, "yarn install");
    }
    return engine.interpolate(npmCommand, engine.vars(this.frameworks));
  }

  buildCommand(): string | null {
    const scripts: string[] = [];
    // Note: we assume build trumps all. If there's a build script we don't
    // even run tsc. Though we should use the correct package manager to build.
    if (this.scripts.includes("build")) {
      scripts.push("npm run build");
    } else {
      if (this.lang === "ts-local") {
        scripts.push("./node_modules/.bin/tsc");
      } else if (this.lang === "ts-global") {
        scripts.push("tsc");
      }
      for (const framework of this.frameworks) {
        if (framework.buildCommand) {
          scripts.push(framework.buildCommand);
          break;
        }
      }
    }

    if (!scripts.length) {
      return null;
    }

    let command = scripts.join(" && ");
    if (this.pkgMgr === "yarn") {
      command = command.replace("npm run", "yarn run");
    }

    return engine.interpolate(command, engine.vars(this.frameworks));
  }

  devCommand(): string | null {
    let devCommand: string | null = null;
    if (this.scripts.includes("dev")) {
      devCommand = "npm run dev";
    }
    if (!devCommand && this.scripts.includes("start")) {
      devCommand = "npm run start";
    }
    if (!devCommand) {
      for (const framework of this.frameworks) {
        if (framework.devCommand) {
          devCommand = framework.devCommand;
          break;
        }
      }
    }
    if (devCommand && this.pkgMgr === "yarn") {
      return devCommand.replace("npm", "yarn");
    }

    return engine.interpolate(devCommand, engine.vars(this.frameworks));
  }
}

export class NodejsRuntime {
  // Note: Dependencies are wonky here. For example, multiple vite plugins use
  // vite transparently. Next.js also uses React transitively. Should we "inherit"
  // things from vite in that case or just reimplement the few extra fields?
  // Maybe it's the builder that needs to know this deep inheritance?
  private frameworks: engine.Framework[] | null = null;
  loadFrameworks(): Promise<void> {
    // TODO: Load these dyanmically from a data file(s)
    this.frameworks = [
      {
        name: "core:express",
        parent: "nodejs",
        dependencies: [{ name: "express" }],
      },
      {
        name: "core:nextjs",
        parent: "nodejs",
        requiredFiles: [["next.config.js", "next.config.ts"]],
        dependencies: [{ name: "next" }],
      },
      {
        name: "core:angular",
        parent: "nodejs",
        dependencies: [{ name: "@angular/core" }, { name: "@angular/cli" }],
        buildCommand: "ng build",
        devCommand: "ng run",
      },
      {
        name: "core:astro",
        parent: "nodejs",
        requiredFiles: [
          ["astro.config.mjs", "astro.config.cjs", "astro.config.js", "astro.config.ts"],
        ],
        dependencies: [{ name: "astrojs" }],
        canEmbed: ["core:svelte", "core:react", "core:svelte-vite", "core:react-vite"],
        buildCommand: "astro build",
        devCommand: "astro preview",
      },
      {
        name: "core:react",
        parent: "nodejs",
        dependencies: [{ name: "react" }, { name: "react-dom" }],
      },
      {
        name: "core:react-vite",
        parent: "core:vite",
        dependencies: [{ name: "react" }, { name: "react-dom" }],
        vars: { vitePlugin: "react-jsx" },
      },
      {
        name: "core:svelte",
        parent: "nodejs",
        // optionalFiles: svelte.config.js
        dependencies: [{ name: "svelte" }],
      },
      {
        name: "core:svelte-vite",
        parent: "core:vite",
        dependencies: [{ name: "svelte" }],
        canEmbed: ["core:svelte"],
        vars: { vitePlugin: "vite-plugin-svelte" },
      },

      // Note: Sveltekit is built on Vite but does not extend the vite note because
      // the dependency is transitive
      {
        name: "core:sveltekit",
        parent: "core:svelte",
        dependencies: [{ name: "@sveltejs/kit" }],
      },
      {
        name: "core:vite",
        parent: "nodejs",
        dependencies: [{ name: "vite" }],
        buildCommand: "vite build",
        devCommand: "vite preview",
      },
    ];
    return Promise.resolve();
  }

  /**
   * Detects a node codebase and returns the Codebase with the detected framework(s).
   */
  async detectCodebase(fs: engine.FileSystem): Promise<engine.Codebase | null> {
    let pkgJsonRaw: string | null = null;
    let hasYarn = false;
    let hasTsconfig = false;
    await Promise.all([
      (async () => {
        try {
          pkgJsonRaw = await fs.read("package.json");
        } catch (err: any) {
          if (err.code === "ENOENT") {
            pkgJsonRaw = null;
          }
        }
      })(),
      (async () => {
        hasYarn = await fs.exists("yarn.lock");
      })(),
      (async () => {
        hasTsconfig = await fs.exists("tsconfig.json");
      })(),
    ]);
    if (!pkgJsonRaw) {
      return null;
    }
    // TODO: Find out why pkgJsonRaw is never. TypeScript isn't seeing the assignment
    // as real.
    const pkgJson = JSON.parse((pkgJsonRaw as Buffer).toString("utf-8")) as PackageJson;
    const pkgMgr: PackageManager = hasYarn ? "yarn" : "npm";
    // TODO: consider reading lockfile over pkg.json
    const dependencies = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    const lang: Language = hasTsconfig
      ? dependencies["typescript"]
        ? "ts-local"
        : "ts-global"
      : "js";

    if (!this.frameworks) {
      await this.loadFrameworks();
    }
    const matcher = new engine.FrameworkMatcher("nodejs", fs, this.frameworks!, dependencies);
    return new NodejsCodebase(
      pkgMgr,
      lang,
      Object.keys(pkgJson.scripts || {}),
      await matcher.match()
    );
  }
}
