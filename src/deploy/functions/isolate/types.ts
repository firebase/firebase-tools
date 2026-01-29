export interface PackageManifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface WorkspacePackage {
  name: string;
  absoluteDir: string;
  rootRelativeDir: string;
  manifest: PackageManifest;
}

export type WorkspaceRegistry = Map<string, WorkspacePackage>;

export interface IsolateOptions {
  projectDir: string;
  sourceDir: string;
  outputDir: string;
  includeDevDependencies: boolean;
}

export interface IsolateResult {
  isolatedDir: string;
  packagesIncluded: string[];
}
