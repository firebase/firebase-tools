import { Client } from "../apiv2";
import { FirebaseError } from "../error";

// TODO: Consider making this use REP in the future so we can be used by more
// customers.
import { cloudbuildOrigin, runOrigin } from "../api";
import * as proto from "./proto";
import { assertImplements, RecursiveKeyOf } from "../metaprogramming";
import { LongRunningOperation, pollOperation } from "../operation-poller";
import * as backend from "../deploy/functions/backend";
import {
  CODEBASE_LABEL,
} from "../functions/constants";
import { v } from "@electric-sql/pglite/dist/pglite-DqRPKYWs";


export const API_VERSION = "v2";


const client = new Client({
    urlPrefix: runOrigin(),
    auth: true,
    apiVersion: API_VERSION,
});

export type EnvVar = {
    name: string;
} & ({
    value: string;
} | {
    valueSource: {
        secretKeyRef: {
            secret: string; // Secret name
            version?: string; // Optional version, defaults to latest
        };
    };
});

export interface Container {
    name: string;
    image: string;
    command?: string[];
    args?: string[];
    env?: EnvVar[];
    resources?: {
        limits?: {
            cpu?: string; // e.g. "1", "2", "4"
            memory?: string; // e.g. "256Mi", "512Mi", "1Gi"
            ["nvidia.com/gpu"]?: string;
        };
        startupCpuBoost?: boolean; // If true, the container will get a CPU boost during startup.
    };
    // Lots more. Most intereeseting is baseImageUri and maybe buildInfo.
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
    containers?: Container[];
    containerConcurrency?: number;
}

export interface BuildConfig {
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
    launchStage?: string;

    // In the proto definition, but not what we use to actually track this it seems?
    client?: string;
    clientVersion?: string;

    etag: string;
    template: RevisionTemplate;
    invokerIamDisabled?: boolean;
    // Is this redundant with the Build API?
    buildConfig?: BuildConfig;
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
    // Always update revision name to ensure null generates a new unique revision name.
    fieldMask.push("template.revision");
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

// TODO: Replace with real version:
function functionNameToServiceName(id: string): string {
    return id.toLowerCase().replace(/_/g, "-");
}

/**
 * The following is the YAML of a v2 function's Run service labels & annotations:
 * 
 * labels:
 *   goog-drz-cloudfunctions-location: us-central1
 *   goog-drz-cloudfunctions-id: ejectrequest
 *   firebase-functions-hash: 3653cb61dcf8e18a4a8706251b627485a5e83cd0
 *   firebase-functions-codebase: js
 *   goog-managed-by: cloudfunctions
 *   goog-cloudfunctions-runtime: nodejs22
 *   cloud.googleapis.com/location: us-central1
 * annotations:
 *   run.googleapis.com/custom-audiences: '["https://us-central1-inlined-junkdrawer.cloudfunctions.net/ejectRequest"]'
 *   run.googleapis.com/client-name: cli-firebase
 *   run.googleapis.com/build-source-location: gs://gcf-v2-sources-92611791981-us-central1/ejectRequest/function-source.zip#1749833196570851
 *   run.googleapis.com/build-environment-variables: '{"GOOGLE_NODE_RUN_SCRIPTS":""}'
 *   run.googleapis.com/build-function-target: ejectRequest
 *   run.googleapis.com/build-enable-automatic-updates: 'true'
 *   run.googleapis.com/build-base-image: us-central1-docker.pkg.dev/serverless-runtimes/google-22-full/runtimes/nodejs22
 *   run.googleapis.com/build-image-uri: us-central1-docker.pkg.dev/inlined-junkdrawer/gcf-artifacts/inlined--junkdrawer__us--central1__eject_request:version_1
 *   run.googleapis.com/build-name: projects/92611791981/locations/us-central1/builds/4d41c5e1-9ab9-4889-826b-c64a0d58c99a
 *   serving.knative.dev/creator: service-92611791981@gcf-admin-robot.iam.gserviceaccount.com
 *   serving.knative.dev/lastModifier: service-92611791981@gcf-admin-robot.iam.gserviceaccount.com
 *   run.googleapis.com/operation-id: 67a480e9-24ac-40bd-aaa1-a76e87bf3e45
 *   run.googleapis.com/ingress: all
 *   run.googleapis.com/ingress-status: all
 *   cloudfunctions.googleapis.com/function-id: ejectRequest
 *   run.googleapis.com/urls: '["https://ejectrequest-92611791981.us-central1.run.app","https://us-central1-inlined-junkdrawer.cloudfunctions.net/ejectRequest","https://ejectrequest-uvb3o4q2mq-uc.a.run.app"]'
 * 
 * After ejection it is:
 * labels:
 *   goog-drz-cloudfunctions-location: us-central1
 *   goog-drz-cloudfunctions-id: ejectrequest
 *   firebase-functions-hash: 3653cb61dcf8e18a4a8706251b627485a5e83cd0
 *   firebase-functions-codebase: js
 *   goog-managed-by: ''
 *   goog-cloudfunctions-runtime: nodejs22
 *   cloud.googleapis.com/location: us-central1
 * annotations:
 *   serving.knative.dev/creator: service-92611791981@gcf-admin-robot.iam.gserviceaccount.com
 *   serving.knative.dev/lastModifier: service-92611791981@gcf-admin-robot.iam.gserviceaccount.com
 *   run.googleapis.com/custom-audiences: '["https://us-central1-inlined-junkdrawer.cloudfunctions.net/ejectRequest"]'
 *   run.googleapis.com/client-name: cli-firebase
 *   run.googleapis.com/build-source-location: gs://gcf-v2-sources-92611791981-us-central1/ejectRequest/function-source.zip#1749833196570851
 *   run.googleapis.com/build-environment-variables: '{"GOOGLE_NODE_RUN_SCRIPTS":""}'
 *   run.googleapis.com/build-function-target: ejectRequest
 *   run.googleapis.com/build-enable-automatic-updates: 'true'
 *   run.googleapis.com/build-base-image: us-central1-docker.pkg.dev/serverless-runtimes/google-22-full/runtimes/nodejs22
 *   run.googleapis.com/build-image-uri: us-central1-docker.pkg.dev/inlined-junkdrawer/gcf-artifacts/inlined--junkdrawer__us--central1__eject_request:version_1
 *   run.googleapis.com/build-name: projects/92611791981/locations/us-central1/builds/4d41c5e1-9ab9-4889-826b-c64a0d58c99a
 *   cloudfunctions.googleapis.com/function-id: ejectRequest
 *   run.googleapis.com/operation-id: 8fed392e-1ded-4499-b233-ac689857be15
 *   run.googleapis.com/ingress: all
 *   run.googleapis.com/ingress-status: all
 *   run.googleapis.com/urls: '["https://ejectrequest-92611791981.us-central1.run.app","https://us-central1-inlined-junkdrawer.cloudfunctions.net/ejectRequest","https://ejectrequest-uvb3o4q2mq-uc.a.run.app"]'
 * 
 * This sample was taken from an https function, but we should assume that all labels we use in GCF translate to Run
 * and preserve them to keep the Console similar for GCF 2nd gen vs Cloud Run functions when reading.
 * Notable differences from the Functions interface though is that "goog-managed-by" should be firebase-functions and
 * "run.googleapis.com/client-name" should be "cli-firebase" on eject.
 */
export const METADATA_ANNOTATION = "firebase.googleapis.com/function-metadata";

// NOTE: I'm seeing different values for functions that were ejected vs functions created in the Cloud Console directly with CRF.
// E.g. build-function-target may be a scalar like "ejectRequest" or a JSON object like '{"worker":"ejectRequest"}' where
// the key is the container name. Tinkering may be necessary to see if one or the other is better.
export const RUNTIME_LABEL = "goog-cloudfunctions-runtime";
export const CLIENT_NAME_LABEL = "goog-managed-by";
export const CLIENT_NAME_ANNOTATION = "run.googleapis.com/client-name";
export const CPU_BOOST_ANNOTATION = "run.googleapis.com/startup-cpu-boost";
export const TRIGGER_TYPE_ANNOTATION = "cloudfunctions.googleapis.com/trigger-type";
export const FUNCTION_TARGET_ANNOTATION = "run.googleapis.com/build-function-target" // e.g. '{"worker":"triggerTest"}'
export const FUNCTION_ID_ANNOTATION = "cloudfunctions.googleapis.com/function-id"; // e.g. "triggerTest"
export const BASE_IMAGE_ANNOTATION = "run.googleapis.com/base-images"; //: '{"worker":"us-central1-docker.pkg.dev/serverless-runtimes/google-22-full/runtimes/nodejs22"}'
export const MAX_INSTANCES_ANNOTATION = "autoscaling.knative.dev/maxScale";
export const MIN_INSTANCES_ANNOTATION = "autoscaling.knative.dev/minScale";
export const DEFAULT_FUNCTION_CONTAINER_NAME = "worker";
// Partial implementation. A full implementation may require more refactoring.
// E.g. server-side we need to know the actual names of the resources we're
// referencing. So maybe endpointFromSerivce should be async and fetch the
// values from the dependent services? But serviceFromEndpoint currently
// only returns the service and not the dependent resources, which we will
// need for updates.
export function endpointFromService(service: Service): backend.Endpoint {
}

export function serviceFromEndpoint(endpoint: backend.Endpoint, image: string): Omit<Service, ServiceOutputFields> {
    const labels: Record<string, string> = {
        [RUNTIME_LABEL]: endpoint.runtime,
        [CLIENT_NAME_LABEL]: "firebase-functions",
    }
    if (endpoint.codebase) {
        labels[CODEBASE_LABEL] = endpoint.codebase;
    }
    // TODO hash

    const annotations: Record<string, string> = {
        [CLIENT_NAME_ANNOTATION]: "cli-firebase",
        [FUNCTION_TARGET_ANNOTATION]: endpoint.id,
        [FUNCTION_ID_ANNOTATION]: endpoint.id,
        [CPU_BOOST_ANNOTATION]: "true",
        // TODO: Add run.googleapis.com/base-images: {'worker': <image>} for the runtime and set
        // template.runtimeClassName: run.googleapis.com/linux-base-image-update
    }
    if (endpoint.minInstances) {
        annotations[MIN_INSTANCES_ANNOTATION] = String(endpoint.minInstances);
    }
    if (endpoint.maxInstances) {
        annotations[MAX_INSTANCES_ANNOTATION] = String(endpoint.maxInstances);
    }
    const template: RevisionTemplate = {
        containers: [{
            name: "worker",
            image,
            // PORT?!
            env: {
                ...Object.entries(endpoint.environmentVariables || {}).map(([name, value]) => ({name, value})),
                ...Object.entries(endpoint.secretEnvironmentVariables || {}).map(([name, value]) => ({
                    name,
                    valueSource: {
                        secretKeyRef: {
                            secret: value.secret,
                            version: value.version,
                        },
                    }
                })),
            },
            resources: {
                limits: {
                    cpu: String(endpoint.cpu as Number || 1),
                    memory: `${endpoint.availableMemoryMb || 256}Mi`,
                },
                startupCpuBoost: true,
            }
        }]
    };
    proto.renameIfPresent(template, endpoint, "containerConcurrency", "concurrency");
    // TODO: other trigger types, service accounts, concurrency, etc.
    return {
        name: `projects/${endpoint.project}/locations/${endpoint.region}/services/${functionNameToServiceName(endpoint.id)}`,
        labels,
        annotations,
        template,
    };
}