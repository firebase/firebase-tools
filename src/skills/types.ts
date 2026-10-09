export interface SkillManifestEntry {
  source: string;
  localFileHash: string;
  transformations?: {
    alias?: string;
    [key: string]: any;
  };
}

export interface SkillManifest {
  cliVersion: string;
  lastUpdateDate: string;
  skills: Record<string, SkillManifestEntry>;
}

export interface SkillRegistry {
  skills: Record<string, string>;
  tombstones?: Record<string, string>;
}
