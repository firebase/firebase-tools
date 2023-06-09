export interface FileSystem {
  exists(file: string): Promise<boolean>;
  read(file: string): Promise<string | null>;
}

export interface Runtime {
  match(fs: FileSystem): Promise<boolean | null>;
  getRuntimeName(): string;
  analyseCodebase(fs: FileSystem, allFrameworkSpecs: FrameworkSpec[]): Promise<RuntimeSpec | null>;
}

export interface Command {
  // Consider: string[] for series of commands that must execute successfully
  // in sequence.
  cmd: string | string[];
  script?: string;
  env?: Record<string, string>;
}

export interface LifecycleCommands {
  build?: Command;
  run?: Command;
  dev?: Command;
}

export interface FrameworkSpec {
  id: string;

  // This Framework is a refinement of the parent framework. It can only be
  // selected when the parent's requirements are also met. If this framework
  // matches, its scripts take precedence over the parent's scripts.
  requireFramework?: string;

  // Only analyze Frameworks with a runtime that matches the matched runtime
  runtime: string;

  // e.g. nextjs. Used to verify that Web Frameworks' legacy code and the
  // FrameworkSpec agree with one another
  webFrameworkId?: string;

  // VSCode plugins that assist with writing a particular framework
  suggestedPlugins?: string[];

  requiredDependencies: Array<{
    name: string;
    semver?: string;
  }>;

  // If a requiredFiles is an array, then one of the files in the array must match.
  // This supports, for example, a file that can be a js, ts, or mjs file.
  requiredFiles?: Array<string | string[]>;

  // Any commands that this framework needs that are not standard for the
  // runtime. Often times, this can be empty (e.g. depend on npm run build and
  // npm run start)
  commands?: LifecycleCommands;

  // We must resolve to a single framework when getting build/dev/run commands.
  // embedsFrameworks helps decide tiebreakers by saying, for example, that "astro"
  // can embed "svelte", so if both frameworks are discovered, monospace can
  // suggest both frameworks' plugins, but should run astro's commands.
  embedsFrameworks?: string[];

  samples?: FrameworkSample[];
}

export interface RuntimeSpec {
  // e.g. `nodejs`
  id: string;

  // e.g. `node18-slim`. Depends on user code (e.g. engine field in package.json)
  baseImage: string;

  // e.g. `npm install yarn typescript`
  packageManagerInstallCommand?: string;

  // e.g. `npm ci`, `npm install`, `yarn`
  installCommand?: string;

  // Commands to run right before exporting the container image
  // e.g. npm prune --omit=dev, yarn install --production=true
  exportCommands?: string[];

  // The runtime has detected a command that should always be run irrespective of
  // the framework (e.g. the "build" script always wins in Node)
  detectedCommands?: LifecycleCommands;

  fallbackCommands?: LifecycleCommands;
}

export interface SampleInstallStrategy {
  githubUrl: string;
  command: string;
}

export interface FrameworkSample {
  name: string;
  description: string;
  icon: string;

  // oneof
  install: SampleInstallStrategy;

  // e.g. "javascript" and "typescript" variants
  installVariants: Record<string, SampleInstallStrategy>;
}
