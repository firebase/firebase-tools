import { MemoryOptions } from "../deploy/functions/backend";
import { Runtime } from "../deploy/functions/runtimes";
import * as proto from "../gcp/proto";
import { SpecParamType } from "./extensionsHelper";

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
  repoUri?: string;
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
  extensionRoot?: string;
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
  etag?: string;
  extensionRef?: string;
  extensionVersion?: string;
}

export interface ExtensionConfig {
  name: string;
  createTime: string;
  source: ExtensionSource;
  params: Record<string, string>;
  systemParams: Record<string, string>;
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
  sourceUrl?: string;
  params: Param[];
  systemParams: Param[];
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
    availableMemoryMb?: MemoryOptions;
    runtime?: Runtime;
    httpsTrigger?: Record<string, never>;
    scheduleTrigger?: Record<string, string>;
    taskQueueTrigger?: {
      rateLimits?: {
        maxConcurrentDispatchs?: number;
        maxDispatchesPerSecond?: number;
      };
      retryConfig?: {
        maxAttempts?: number;
        maxRetrySeconds?: number;
        maxBackoffSeconds?: number;
        maxDoublings?: number;
        minBackoffSeconds?: number;
      };
    };
    eventTrigger?: {
      eventType: string;
      resource: string;
      service?: string;
    };
  };
}

export const FUNCTIONS_V2_RESOURCE_TYPE = "firebaseextensions.v1beta.v2function";
export interface FunctionV2ResourceProperties {
  type: typeof FUNCTIONS_V2_RESOURCE_TYPE;
  properties?: {
    location?: string;
    sourceDirectory?: string;
    buildConfig?: {
      runtime?: Runtime;
    };
    serviceConfig?: {
      availableMemory?: string;
      timeoutSeconds?: number;
      minInstanceCount?: number;
      maxInstanceCount?: number;
    };
    eventTrigger?: {
      eventType: string;
      triggerRegion?: string;
      channel?: string;
      pubsubTopic?: string;
      retryPolicy?: string;
      eventFilters?: FunctionV2EventFilter[];
    };
  };
}

export interface FunctionV2EventFilter {
  attribute: string;
  value: string;
  operator?: string;
}

// Union of all valid property types so we can have a strongly typed "property"
// field depending on the actual value of "type"
type ResourceProperties = FunctionResourceProperties | FunctionV2ResourceProperties;

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
  advanced?: boolean;
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
