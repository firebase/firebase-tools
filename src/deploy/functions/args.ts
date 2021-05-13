// These types should proably be in a root deploy.ts, but we can only boil the ocean one bit at a time.

import { ReadStream } from "fs";
import * as gcf from "../../gcp/cloudfunctions";
import * as deploymentPlanner from "./deploymentPlanner";

// Payload holds the output types of what we're building.
export interface Payload {
  functions?: {
    byRegion: deploymentPlanner.RegionMap;
    triggers: deploymentPlanner.CloudFunctionTrigger[];
  };
}

// Options come from command-line options and stored config values
// TODO: actually define all of this stuff in command.ts and import it from there.
export interface Options {
  cwd: string;
  configPath: string;

  // OMITTED: project. Use context.projectId instead

  only: string;

  // defined in /config.js
  config: {
    // Note: it might be worth defining overloads for config values we use in
    // deploy/functions.
    get(key: string, defaultValue?: any): any;
    set(key: string, value: any): void;
    has(key: string): boolean;
    path(pathName: string): string;

    // I/O methods: these methods work with JSON objects.
    // WARNING: they all use synchronous I/O
    readProjectFile(file: string): unknown;
    writeProjectFile(path: string, content: unknown): void;
    askWriteProjectFile(path: string, content: unknown): void;

    projectDir: string;
  };
  filteredTargets: string[];
  nonInteractive: boolean;
  force: boolean;
}

export interface FunctionsSource {
  file: string;
  stream: ReadStream;
  size: number;
}

// Context holds cached values of what we've looked up in handling this request.
// For non-trivial values, use helper functions that cache automatically and/or hide implementation
// details.
export interface Context {
  projectId: string;
  filters: string[][];

  // Filled in the "prepare" phase.
  functionsSource?: FunctionsSource;
  // TODO: replace with backend.Runtime once it is committed.
  runtimeChoice?: gcf.Runtime;
  runtimeConfigEnabled?: boolean;
  firebaseConfig?: FirebaseConfig;

  // Filled in the "deploy" phase.
  uploadUrl?: string;

  // TOOD: move to caching function w/ helper
  existingFunctions?: gcf.CloudFunction[];
}

export interface FirebaseConfig {
  locationId: string;
  projectId: string;
  storageBucket: string;
  databaseURL: string;
}
