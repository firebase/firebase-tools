export const NAMESPACE_FIREBASE = "firebase";
export const DEFAULT_PAGE_SIZE = "10";

export enum TagColor {
  BLUE = "Blue",
  BROWN = "Brown",
  CYAN = "Cyan",
  DEEP_ORANGE = "Red Orange",
  GREEN = "Green",
  INDIGO = "Indigo",
  LIME = "Lime",
  ORANGE = "Orange",
  PINK = "Pink",
  PURPLE = "Purple",
  TEAL = "Teal",
}

/** Interface representing a Remote Config parameter `value` in value options. */
export interface ExplicitParameterValue {
  value: string;
}

/** Interface representing a Remote Config parameter `useInAppDefault` in value options. */
export interface InAppDefaultValue {
  useInAppDefault: boolean;
}

export type RemoteConfigParameterValue = ExplicitParameterValue | InAppDefaultValue;

/** Interface representing a Remote Config parameter. */
export interface RemoteConfigParameter {
  defaultValue?: RemoteConfigParameterValue;
  conditionalValues?: { [key: string]: RemoteConfigParameterValue };
  description?: string;
}

/** Interface representing a Remote Config parameter group. */
export interface RemoteConfigParameterGroup {
  description?: string;
  parameters: { [key: string]: RemoteConfigParameter };
}

/** Interface representing a Remote Config condition. */
export interface RemoteConfigCondition {
  name: string;
  expression: string;
  tagColor?: TagColor;
}

// Interface representing Remote Config Template with conditions, parameters, parameterGroups, version
export interface RemoteConfigTemplate {
  conditions: RemoteConfigCondition[];
  parameters: { [key: string]: RemoteConfigParameter };
  parameterGroups: { [key: string]: RemoteConfigParameterGroup };
  readonly etag: string;
  version?: Version;
}

/** Interface representing a Remote Config version. */
export interface Version {
  versionNumber?: string; // int64 format
  updateTime?: string; // in UTC
  updateOrigin?:
    | "REMOTE_CONFIG_UPDATE_ORIGIN_UNSPECIFIED"
    | "CONSOLE"
    | "REST_API"
    | "ADMIN_SDK_NOD";
  updateType?:
    | "REMOTE_CONFIG_UPDATE_TYPE_UNSPECIFIED"
    | "INCREMENTAL_UPDATE"
    | "FORCED_UPDATE"
    | "ROLLBACK";
  updateUser?: RemoteConfigUser;
  description?: string;
  rollbackSource?: string;
  isLegacy?: boolean;
}

/** Interface representing a list of Remote Config template versions. */
export interface ListVersionsResult {
  versions: Version[];
  nextPageToken?: string;
}

/** Interface representing a Remote Config list version options. */
export interface ListVersionsOptions {
  pageSize?: number;
  pageToken?: string;
  endVersionNumber?: string | number;
  startTime?: Date | string;
  endTime?: Date | string;
}

/** Interface representing a Remote Config user. */
export interface RemoteConfigUser {
  email: string;
  name?: string;
  imageUrl?: string;
}

/** Interface representing a Remote Config experiment. */
export interface RemoteConfigExperiment {
  name: string;
  definition: ExperimentDefinition;
  state: string;
  startTime: string;
  endTime: string;
  lastUpdateTime: string;
  etag: string;
}

/** Interface representing the definition of a Remote Config experiment. */
interface ExperimentDefinition {
  displayName: string;
  service: string;
  description?: string;
}

/**
 * Interface representing the result of fetching a Remote Config experiment.
 */
export interface GetExperimentResult extends RemoteConfigExperiment {
  definition: GetExperimentDefinition;
}

/**
 * Interface representing a detailed definition of a Remote Config experiment.
 */
interface GetExperimentDefinition extends ExperimentDefinition {
  objectives: ExperimentObjectives;
  variants: ExperimentVariant[];
}

/** Interface representing all objectives of a Remote Config experiment. */
interface ExperimentObjectives {
  activationEvent: { event?: string };
  eventObjectives: ExperimentEventObjectives[];
}

/** Type representing the event objectives of a Remote Config experiment. */
type ExperimentEventObjectives = {
  isPrimary?: boolean;
} & (
  | { systemObjectiveDetails: ExperimentSystemObjectiveDetails; customObjectiveDetails?: never }
  | { customObjectiveDetails: ExperimentCustomObjectiveDetails; systemObjectiveDetails?: never }
);

/** Interface representing system objectives of a Remote Config experiment. */
interface ExperimentSystemObjectiveDetails {
  objective: string;
}

/** Interface representing custom objectives of a Remote Config experiment. */
interface ExperimentCustomObjectiveDetails {
  event: string;
  countType: string;
}

/** Interface representing an experiment variant. */
interface ExperimentVariant {
  name: string;
  weight: number;
}

/** Interface representing a list of Remote Config experiments. */
export interface ListExperimentsResult {
  experiments?: RemoteConfigExperiment[];
  nextPageToken?: string;
}

/** Interface representing a Remote Config list experiment options. */
export interface ListExperimentOptions {
  pageSize: string;
  pageToken?: string;
  filter?: string;
}

/** Interface representing the definition of a Remote Config rollout. */
export interface RolloutDefinition {
  displayName: string;
  description: string;
  service: string;
  controlVariant: ExperimentVariant;
  enabledVariant: ExperimentVariant;
}

/** Interface representing a Remote Config rollout. */
export interface RemoteConfigRollout {
  name: string;
  definition: RolloutDefinition;
  state: string;
  createTime: string;
  startTime: string;
  endTime: string;
  lastUpdateTime: string;
  etag: string;
}

/** Interface representing a list of Remote Config rollouts with pagination. */
export interface ListRollouts {
  rollouts?: RemoteConfigRollout[];
  nextPageToken?: string;
}

/** Interface representing a Remote Config list rollout options. */
export interface ListRolloutOptions {
  pageSize: string;
  pageToken?: string;
  filter?: string;
}
