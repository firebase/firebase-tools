export interface NuxtDependency {
  version?: string;
  resolved?: string;
  overridden?: boolean;
}

export interface NuxtProjectManifest {
  _hash: string | null;
  project: {
    rootDir: string;
  };
  versions: {
    nuxt: string;
  };
}
