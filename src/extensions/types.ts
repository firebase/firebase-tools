/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as proto from "../gcp/proto";
import { SpecParamType } from "./extensionsHelper";
import { Runtime } from "../deploy/functions/runtimes";

export enum RegistryLaunchStage {
  EXPERIMENTAL = "EXPERIMENTAL",
  BETA = "BETA",
  GA = "GA",
  DEPRECATED = "DEPRECATED",
  REGISTRY_LAUNCH_STAGE_UNSPECIFIED = "REGISTRY_LAUNCH_STAGE_UNSPECIFIED",
}

export enum Visibility {
  UNLISTED = "unlisted",
  PUBLIC = "public",
}

export interface Extension {
  name: string;
  ref: string;
  visibility: Visibility;
  registryLaunchStage: RegistryLaunchStage;
  createTime: string;
  latestVersion?: string;
  latestVersionCreateTime?: string;
}

export interface ExtensionVersion {
  name: string;
  ref: string;
  state: "STATE_UNSPECIFIED" | "PUBLISHED" | "DEPRECATED";
  spec: ExtensionSpec;
  hash: string;
  sourceDownloadUri: string;
  releaseNotes?: string;
  createTime?: string;
  deprecationMessage?: string;
}

export interface PublisherProfile {
  name: string;
  publisherId: string;
  registerTime: string;
}

export interface ExtensionInstance {
  name: string;
  createTime: string;
  updateTime: string;
  state: "STATE_UNSPECIFIED" | "DEPLOYING" | "UNINSTALLING" | "ACTIVE" | "ERRORED" | "PAUSED";
  config: ExtensionConfig;
  serviceAccountEmail: string;
  errorStatus?: string;
  lastOperationName?: string;
  lastOperationType?: string;
  extensionRef?: string;
  extensionVersion?: string;
}

export interface ExtensionConfig {
  name: string;
  createTime: string;
  source: ExtensionSource;
  params: {
    [key: string]: any;
  };
  populatedPostinstallContent?: string;
  extensionRef?: string;
  extensionVersion?: string;
  eventarcChannel?: string;
  allowedEventTypes?: string[];
}

export interface ExtensionSource {
  state: "STATE_UNSPECIFIED" | "ACTIVE" | "DELETED";
  name: string;
  packageUri: string;
  hash: string;
  spec: ExtensionSpec;
  extensionRoot?: string;
  fetchTime?: string;
  lastOperationName?: string;
}

export interface ExtensionSpec {
  specVersion?: string;
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  apis?: Api[];
  roles?: Role[];
  resources: Resource[];
  billingRequired?: boolean;
  author?: Author;
  contributors?: Author[];
  license?: string;
  releaseNotesUrl?: string;
  sourceUrl: string;
  params: Param[];
  preinstallContent?: string;
  postinstallContent?: string;
  readmeContent?: string;
  externalServices?: ExternalService[];
  events?: EventDescriptor[];
}

export interface EventDescriptor {
  type: string;
  description: string;
}

export interface ExternalService {
  name: string;
  pricingUri: string;
}

export interface Api {
  apiName: string;
  reason: string;
}

export interface Role {
  role: string;
  reason: string;
}

// Docs at https://firebase.google.com/docs/extensions/alpha/ref-extension-yaml
export const FUNCTIONS_RESOURCE_TYPE = "firebaseextensions.v1beta.function";
export interface FunctionResourceProperties {
  type: typeof FUNCTIONS_RESOURCE_TYPE;
  properties?: {
    location?: string;
    entryPoint?: string;
    sourceDirectory?: string;
    timeout?: proto.Duration;
    availableMemoryMb?: number;
    runtime?: Runtime;
    httpsTrigger?: Record<string, never>;
    eventTrigger?: {
      eventType: string;
      resource: string;
      service?: string;
    };
  };
}

// Union of all valid property types so we can have a strongly typed "property"
// field depending on the actual value of "type"
type ResourceProperties = FunctionResourceProperties;

export type Resource = ResourceProperties & {
  name: string;
  description?: string;
  propertiesYaml?: string;
  entryPoint?: string;
};

export interface Author {
  authorName: string;
  url?: string;
}

export interface Param {
  param: string; // The key of the {param:value} pair.
  label: string;
  description?: string;
  default?: string;
  type?: ParamType | SpecParamType; // TODO(b/224618262): This is SpecParamType when publishing & ParamType when looking at API responses. Choose one.
  options?: ParamOption[];
  required?: boolean;
  validationRegex?: string;
  validationErrorMessage?: string;
  immutable?: boolean;
  example?: string;
}

export enum ParamType {
  STRING = "STRING",
  SELECT = "SELECT",
  MULTISELECT = "MULTISELECT",
  SECRET = "SECRET",
}

export interface ParamOption {
  value: string;
  label?: string;
}
