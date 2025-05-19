import { Client } from "../apiv2";
import { FirebaseError } from "../error";

// TODO: Consider making this use REP in the future so we can be used by more
// customers.
import { cloudbuildOrigin, runOrigin } from "../api";
import * as proto from "./proto";
import { assertImplements, RecursiveKeyOf } from "../metaprogramming";
import { LongRunningOperation, pollOperation } from "../operation-poller";
import * as backend from "../deploy/functions/backend";

export const API_VERSION = "v2";

const client = new Client({
    urlPrefix: runOrigin(),
    auth: true,
    apiVersion: API_VERSION,
});

export interface Container {

}
export interface RevisionTemplate {
    revision?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    scaling?: {
        // N.B. Intentionally omitting revision min/max instance; we should
        // never use them.
        overflowScaling?: boolean;
    };
    vpcAccess?: {
        connector?: string;
        egress?: "ALL_TRAFFIC" | "PRIVATE_RANGES_ONLY";
        networkinterfaces?: Array<{
            network?: string;
            subnetwork?: string;
            tags?: string[];
        }>;
    };
    timeout?: proto.Duration;
    serviceAccount?: string;
}

export interface BuidlConfig {
    name: string;
    sourceLocation: string;
    functionTarget?: string;
    enableAutomaticUpdates?: boolean;
    environmentVariables?: Record<string, string>;
    serviceAccount?: string;
}

// NOTE: This is a minmal copy of Cloud Run needed for our current API usage.
// Add more as needed.
// TODO: Can consider a helper where we have a second RecursiveKeysOf field for
// fields that are optional in input types but we always set them (e.g. empty record)
// in output APIs.
export interface Service {
    name: string;
    description?: string;
    generation: number;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    tags?: Record<string, string>;
    createTime: string;
    updateTime: string;
    creator: string;
    lastModifier: string;
    launchStage: string;
    client: string;
    clientVersion: string;
    etag: string;
    template: RevisionTemplate;
    invokerIamDisabled?: boolean;
    // Is this redundant with the Build API?
    buildConfig?: BuidlConfig;
};

export type ServiceOutputFields =
    "generation" |
    "createTime" |
    "updateTime" |
    "creator" |
    "lastModifier" |
    "etag";

assertImplements<ServiceOutputFields, RecursiveKeyOf<Service>>();

export interface StorageSource {
    bucket: string;
    object: string;
    generation?: string;
}

export interface BuildpacksBuild {
    // Deprecated, presumedly in favor of baseImage?
    runtime?: string;
    functionTarget?: string;
    cacheImageUrl?: string;
    baseImage?: string;

    // NOTE: build-time environment variables, which are not currently used.
    environmentVariables?: Record<string, string>;

    enableAutomaticUpdates?: boolean;
    projectDescriptor?: string;
}

export interface Build {
    runtime?: string;
    functionTarget?: string;
    storageSource: StorageSource;
    imageUri: string;
    buildpacksBuild: BuildpacksBuild;
}

export interface SubmitBuildResponse {
    buildOperation: string;
    baseImageUri?: string;
    baseImageWarning?: string;
}

export async function submitBuild(projectId: string, location: string, build: Build): Promise<void> {
    const res = await client.post<Build, SubmitBuildResponse>(
        `/projects/${projectId}/locations/${location}/builds`,
        build,
    );
    if (res.status !== 200) {
        throw new FirebaseError(
            `Failed to submit build: ${res.status} ${res.body}`,
        );
    }
    await pollOperation({
        apiOrigin: cloudbuildOrigin(),
        apiVersion: "v1",
        operationResourceName: res.body.buildOperation,
    });
}

export async function updateService(
    service: Omit<Service, ServiceOutputFields>): Promise<Service> {
    const fieldMask = proto.fieldMasks(
        service,
        /* doNotRecurseIn...*/"labels", "annotations", "tags");
    const res = await client.post<Omit<Service, ServiceOutputFields>, LongRunningOperation<Service>>(
        service.name,
        service,
        {
            queryParams: {
                updateMask: fieldMask.join(","),
            },
        }
    );
    const svc = await pollOperation<Service>({
        apiOrigin: runOrigin(),
        apiVersion: API_VERSION,
        operationResourceName: res.body.name,
    });
    return svc;
}

export interface EventarcMetadata {
    type: "eventarc";
    eventType: string;

    retry?: boolean;
}

export interface HttpsMetadata {
    type: "https";
}

export interface ScheduleMetadata {
    type: "schedule";
}

export interface CallableMetadata {
    type: "callable";
    genkitAction?: string;
}

export interface TaskQueueMetadata {
    type: "taskqueue";
    queueName: string;
}

export interface BlockingAuthMetadata {
    type: "blocking-auth";
    eventType:
        "beforeCreate" |
        "beforeSignIn" |
        "beforeDelete" |
        "beforeSendSms";
}

type Metadata = {
    displayName: string;
    codebase: string;
    sourceHash: string;
} & (
    EventarcMetadata |
    HttpsMetadata |
    ScheduleMetadata |
    CallableMetadata |
    TaskQueueMetadata |
    BlockingAuthMetadata
)

export const METADATA_ANNOTATION = "firebase.googleapis.com/function-metadata";

// Partial implementation. A full implementation may require more refactoring.
// E.g. server-side we need to know the actual names of the resources we're
// referencing. So maybe endpointFromSerivce should be async and fetch the
// values from the dependent services? But serviceFromEndpoint currently
// only returns the service and not the dependent resources, which we will
// need for updates.
export async function endpointFromService(service: Service): backend.Endpoint {
    const metadataJson = service.annotations?.[METADATA_ANNOTATION];
    if (!metadataJson) {
        throw new FirebaseError(
            `Service ${service.name} does not have metadata annotation ${METADATA_ANNOTATION}`,
        );
    }
    const metadata = JSON.parse(metadataJson) as Metadata;
    const endpoint: backend.Endpoint = {
        labels: service.labels,
        entryPoint: metadata.displayName,
        // template info...
        runtime: "nodejs22",


}

export function serviceFromEndpoint(endpoint: backend.Endpoint): Service {
}