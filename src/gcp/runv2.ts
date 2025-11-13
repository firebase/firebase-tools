import { Client } from "../apiv2";
import { FirebaseError } from "../error";

// TODO: Consider making this use REP in the future so we can be used by more
// customers.
import { cloudbuildOrigin, runOrigin } from "../api";
import * as proto from "./proto";
import { assertImplements, RecursiveKeyOf } from "../metaprogramming";
import { LongRunningOperation, pollOperation } from "../operation-poller";
import * as backend from "../deploy/functions/backend";
import { CODEBASE_LABEL } from "../functions/constants";
import { EnvVar, mebibytes, PlaintextEnvVar, SecretEnvVar } from "./k8s";
import { latest, Runtime } from "../deploy/functions/runtimes/supported";
import { logger } from "..";
import { partition } from "../functional";

export const API_VERSION = "v2";

const client = new Client({
  urlPrefix: runOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

export interface Scaling {
  // N.B. Intentionally omitting revision min/max instance; we should
  // never use them.
  overflowScaling?: boolean;
  minInstanceCount?: number;
  maxInstanceCount?: number;
}

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
    // N.B. This defaults to true if resources is not set and must manually be set to true if it is set.
    cpuIdle?: boolean; // If true, the container will be allowed to idle CPU when not processing requests.
  };
  // Lots more. Most intereeseting is baseImageUri and maybe buildInfo.
}
export interface RevisionTemplate {
  revision?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  // N.B. NEVER set minInstanceCount on this version of scaling or the instances will always be running
  // if there is any traffic tag that points to the revision. Service-level scaling divides the min instances
  // proportionally by traffic percentage.
  scaling?: Scaling;
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

  scaling?: Scaling;

  // In the proto definition, but not what we use to actually track this it seems?
  client?: string;
  clientVersion?: string;

  etag: string;
  template: RevisionTemplate;
  invokerIamDisabled?: boolean;
  // Is this redundant with the Build API?
  buildConfig?: BuildConfig;
}

export type ServiceOutputFields =
  | "generation"
  | "createTime"
  | "updateTime"
  | "creator"
  | "lastModifier"
  | "etag";

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

export async function submitBuild(
  projectId: string,
  location: string,
  build: Build,
): Promise<void> {
  const res = await client.post<Build, SubmitBuildResponse>(
    `/projects/${projectId}/locations/${location}/builds`,
    build,
  );
  if (res.status !== 200) {
    throw new FirebaseError(`Failed to submit build: ${res.status} ${res.body}`);
  }
  await pollOperation({
    apiOrigin: cloudbuildOrigin(),
    apiVersion: "v1",
    operationResourceName: res.body.buildOperation,
  });
}

export async function updateService(service: Omit<Service, ServiceOutputFields>): Promise<Service> {
  const fieldMask = proto.fieldMasks(
    service,
    /* doNotRecurseIn...*/ "labels",
    "annotations",
    "tags",
  );
  // Always update revision name to ensure null generates a new unique revision name.
  fieldMask.push("template.revision");
  const res = await client.post<Omit<Service, ServiceOutputFields>, LongRunningOperation<Service>>(
    service.name,
    service,
    {
      queryParams: {
        updateMask: fieldMask.join(","),
      },
    },
  );
  const svc = await pollOperation<Service>({
    apiOrigin: runOrigin(),
    apiVersion: API_VERSION,
    operationResourceName: res.body.name,
  });
  return svc;
}

/**
 * Lists Cloud Run services in the given project.
 *
 * This method only returns services with the "goog-managed-by" label set to
 * "cloud-functions" or "firebase-functions".
 */
export async function listServices(projectId: string): Promise<Service[]> {
  const allServices: Service[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const queryParams: Record<string, string> = {};
    if (pageToken) {
      queryParams["pageToken"] = pageToken;
    }

    const res = await client.get<{ services?: Service[]; nextPageToken?: string }>(
      `/projects/${projectId}/locations/-/services`,
      { queryParams },
    );

    if (res.status !== 200) {
      throw new FirebaseError(`Failed to list services. HTTP Error: ${res.status}`, { original: res.body as any });
    }

    if (res.body.services) {
      for (const service of res.body.services) {
        if (
          service.labels?.[CLIENT_NAME_LABEL] === "cloud-functions" ||
          service.labels?.[CLIENT_NAME_LABEL] === "firebase-functions"
        ) {
          allServices.push(service);
        }
      }
    }
    pageToken = res.body.nextPageToken;
  } while (pageToken);

  return allServices;
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
// EDIT: Turns out all the above is BS from Pantheon and you can't actually use it because it requires protected read-only fields in V1
// Intead here's the same function in V2.
/**
 * {
 *  "buildConfig": {
 *    "name": "projects/92611791981/locations/us-central1/builds/4d41c5e1-9ab9-4889-826b-c64a0d58c99a",
 *    "enableAutomaticUpdates": true,
 *    "environmentVariables": {
 *      "GOOGLE_NODE_RUN_SCRIPTS": ""
 *    },
 *    "imageUri": "us-central1-docker.pkg.dev/inlined-junkdrawer/gcf-artifacts/inlined--junkdrawer__us--central1__eject_request:version_1",
 *    "baseImage": "us-central1-docker.pkg.dev/serverless-runtimes/google-22-full/runtimes/nodejs22",
 *    "sourceLocation": "gs://gcf-v2-sources-92611791981-us-central1/ejectRequest/function-source.zip#1749833196570851",
 *    "functionTarget": "ejectRequest"
 *  },
 *  "updateTime": "2025-06-13T21:23:05.883496Z",
 *  "uid": "2946ee66-76ec-493c-a853-2f126dabef73",
 *  "creator": "service-92611791981@gcf-admin-robot.iam.gserviceaccount.com",
 *  "generation": "2",
 *  "labels": {
 *    "firebase-functions-hash": "3653cb61dcf8e18a4a8706251b627485a5e83cd0",
 *    "goog-cloudfunctions-runtime": "nodejs22",
 *    "goog-drz-cloudfunctions-id": "ejectrequest",
 *    "firebase-functions-codebase": "js",
 *    "goog-managed-by": "",
 *    "goog-drz-cloudfunctions-location": "us-central1"
 *  },
 *  "ingress": "INGRESS_TRAFFIC_ALL",
 *  "terminalCondition": {
 *    "lastTransitionTime": "2025-06-13T21:23:12.232110Z",
 *    "state": "CONDITION_SUCCEEDED",
 *    "type": "Ready"
 *  },
 *  "trafficStatuses": [
 *    {
 *      "percent": 100,
 *      "type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
 *    }
 *  ],
 *  "launchStage": "GA",
 *  "observedGeneration": "2",
 *  "etag": "\"CLmtssIGEMCopKUD/cHJvamVjdHMvaW5saW5lZC1qdW5rZHJhd2VyL2xvY2F0aW9ucy91cy1jZW50cmFsMS9zZXJ2aWNlcy9lamVjdHJlcXVlc3Q\"",
 *  "latestCreatedRevision": "projects/inlined-junkdrawer/locations/us-central1/services/ejectrequest/revisions/ejectrequest-00002-ruh",
 *  "template": {
 *    "maxInstanceRequestConcurrency": 80,
 *    "labels": {
 *      "firebase-functions-codebase": "js",
 *      "firebase-functions-hash": "3653cb61dcf8e18a4a8706251b627485a5e83cd0"
 *    },
 *    "serviceAccount": "92611791981-compute@developer.gserviceaccount.com",
 *    "scaling": {
 *      "maxInstanceCount": 100
 *    },
 *    "timeout": "60s",
 *    "annotations": {
 *      "cloudfunctions.googleapis.com/trigger-type": "HTTP_TRIGGER"
 *    },
 *    "containers": [
 *      {
 *        "name": "worker",
 *        "image": "us-central1-docker.pkg.dev/inlined-junkdrawer/gcf-artifacts/inlined--junkdrawer__us--central1__eject_request:version_1",
 *        "env": [
 *          {
 *            "name": "FIREBASE_CONFIG",
 *            "value": "{\"projectId\":\"inlined-junkdrawer\",\"databaseURL\":\"https://inlined-junkdrawer.firebaseio.com\",\"storageBucket\":\"inlined-junkdrawer.appspot.com\",\"locationId\":\"us-central\"}"
 *          },
 *          {
 *            "name": "GCLOUD_PROJECT",
 *            "value": "inlined-junkdrawer"
 *          },
 *          {
 *            "name": "EVENTARC_CLOUD_EVENT_SOURCE",
 *            "value": "projects/inlined-junkdrawer/locations/us-central1/services/ejectRequest"
 *          },
 *          {
 *            "name": "FUNCTION_TARGET",
 *            "value": "ejectRequest"
 *          },
 *          {
 *            "name": "LOG_EXECUTION_ID",
 *            "value": "true"
 *          },
 *          {
 *            "name": "FUNCTION_SIGNATURE_TYPE",
 *            "value": "http"
 *          }
 *        ],
 *        "baseImageUri": "us-central1-docker.pkg.dev/serverless-runtimes/google-22-full/runtimes/nodejs22",
 *        "startupProbe": {
 *          "failureThreshold": 1,
 *          "tcpSocket": {
 *            "port": 8080
 *          },
 *          "timeoutSeconds": 240,
 *          "periodSeconds": 240
 *        },
 *        "ports": [
 *          {
 *            "name": "http1",
 *            "containerPort": 8080
 *          }
 *        ],
 *        "resources": {
 *          "startupCpuBoost": true,
 *          "cpuIdle": true,
 *          "limits": {
 *            "cpu": "1",
 *            "memory": "256Mi"
 *          }
 *        }
 *      }
 *    ],
 *    "revision": "ejectrequest-00002-ruh"
 *  },
 *  "conditions": [
 *    {
 *      "lastTransitionTime": "2025-06-13T21:23:12.186199Z",
 *      "state": "CONDITION_SUCCEEDED",
 *      "type": "RoutesReady"
 *    },
 *    {
 *      "lastTransitionTime": "2025-06-13T21:23:10.904451Z",
 *      "state": "CONDITION_SUCCEEDED",
 *      "type": "ConfigurationsReady"
 *    }
 *  ],
 *  "annotations": {
 *    "cloudfunctions.googleapis.com/function-id": "ejectRequest"
 *  },
 *  "customAudiences": [
 *    "https://us-central1-inlined-junkdrawer.cloudfunctions.net/ejectRequest"
 *  ],
 *  "traffic": [
 *    {
 *      "percent": 100,
 *      "type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
 *    }
 *  ],
 *  "createTime": "2025-06-13T16:47:35.642129Z",
 *  "name": "projects/inlined-junkdrawer/locations/us-central1/services/ejectrequest",
 *  "latestReadyRevision": "projects/inlined-junkdrawer/locations/us-central1/services/ejectrequest/revisions/ejectrequest-00002-ruh",
 *  "uri": "https://ejectrequest-uvb3o4q2mq-uc.a.run.app",
 *  "client": "cli-firebase",
 *  "urls": [
 *    "https://ejectrequest-92611791981.us-central1.run.app",
 *    "https://us-central1-inlined-junkdrawer.cloudfunctions.net/ejectRequest",
 *    "https://ejectrequest-uvb3o4q2mq-uc.a.run.app"
 *  ],
 *  "lastModifier": "service-92611791981@gcf-admin-robot.iam.gserviceaccount.com"
 *}
 */

// NOTE: I'm seeing different values for functions that were ejected vs functions created in the Cloud Console directly with CRF.
// E.g. build-function-target may be a scalar like "ejectRequest" or a JSON object like '{"worker":"ejectRequest"}' where
// the key is the container name. Tinkering may be necessary to see if one or the other is better.

// Note this runtime seems to be somewhat redundant with containers.baseImage
export const RUNTIME_LABEL = "goog-cloudfunctions-runtime";

// In GCF 2nd gen this is cloudfunctions but is the empty string after ejecting. We can use a new value to detect how much
// of the fleet has migrated.
export const CLIENT_NAME_LABEL = "goog-managed-by";

// NOTE: Any annotation with a google domain prefix is read-only and a holdover from the GCF API.
export const TRIGGER_TYPE_ANNOTATION = "cloudfunctions.googleapis.com/trigger-type";
export const FUNCTION_TARGET_ANNOTATION = "run.googleapis.com/build-function-target"; // e.g. '{"worker":"triggerTest"}'
export const FUNCTION_ID_ANNOTATION = "cloudfunctions.googleapis.com/function-id"; // e.g. "triggerTest"

export const FUNCTION_TARGET_ENV = "FUNCTION_TARGET";
export const FUNCTION_SIGNATURE_TYPE_ENV = "FUNCTION_SIGNATURE_TYPE";

export const FIREBASE_FUNCTION_METADTA_ANNOTATION = "firebase-functions-metadata";
export interface FirebaseFunctionMetadata {
  functionId: string;
  // TODO: Trigger type since we cannot set cloudfunctions.googleapis.com/trigger-type
}

// Partial implementation. A full implementation may require more refactoring.
// E.g. server-side we need to know the actual names of the resources we're
// referencing. So maybe endpointFromSerivce should be async and fetch the
// values from the dependent services? But serviceFromEndpoint currently
// only returns the service and not the dependent resources, which we will
// need for updates.
export function endpointFromService(service: Omit<Service, ServiceOutputFields>): backend.Endpoint {
  const [, /* projects*/ project /* locations*/, , location /* services*/, , svcId] =
    service.name.split("/");

  const metadata = JSON.parse(
    service.annotations?.[FIREBASE_FUNCTION_METADTA_ANNOTATION] || "{}",
  ) as FirebaseFunctionMetadata;

  const [env, secretEnv] = partition(
    service.template.containers![0]!.env || [],
    (e) => "value" in e,
  ) as [PlaintextEnvVar[], SecretEnvVar[]];

  const id =
    metadata.functionId ||
    service.annotations?.[FUNCTION_ID_ANNOTATION] ||
    service.annotations?.[FUNCTION_TARGET_ANNOTATION] ||
    env.find((e) => e.name === FUNCTION_TARGET_ENV)?.value ||
    svcId;
  const memory = mebibytes(service.template.containers![0]!.resources!.limits!.memory!);
  if (!backend.isValidMemoryOption(memory)) {
    logger.debug("Converting a service to an endpoint with an invalid memory option", memory);
  }
  const cpu = Number(service.template.containers![0]!.resources!.limits!.cpu);
  const endpoint: backend.Endpoint = {
    platform: service.labels?.[CLIENT_NAME_LABEL] === "cloud-functions" ? "gcfv2" : "run",
    id,
    project,
    labels: service.labels || {},
    region: location,
    runtime: (service.labels?.[RUNTIME_LABEL] as Runtime) || latest("nodejs"),
    availableMemoryMb: memory as backend.MemoryOptions,
    cpu: cpu,
    entryPoint:
      env.find((e) => e.name === FUNCTION_TARGET_ENV)?.value ||
      service.annotations?.[FUNCTION_TARGET_ANNOTATION] ||
      service.annotations?.[FUNCTION_ID_ANNOTATION] ||
      id,
    ...(service.annotations?.[TRIGGER_TYPE_ANNOTATION] === "HTTP_TRIGGER"
      ? { httpsTrigger: {} }
      : {
          eventTrigger: {
            eventType: service.annotations?.[TRIGGER_TYPE_ANNOTATION] || "unknown",
            retry: false,
          },
        }),
  };
  proto.renameIfPresent(endpoint, service.template, "concurrency", "containerConcurrency");
  proto.renameIfPresent(endpoint, service.labels || {}, "codebase", CODEBASE_LABEL);
  proto.renameIfPresent(endpoint, service.scaling || {}, "minInstances", "minInstanceCount");
  proto.renameIfPresent(endpoint, service.scaling || {}, "maxInstances", "maxInstanceCount");

  endpoint.environmentVariables = env.reduce<Record<string, string>>((acc, e) => {
    acc[e.name] = e.value;
    return acc;
  }, {});
  endpoint.secretEnvironmentVariables = secretEnv.map((e) => {
    const [, /* projects*/ projectId /* secrets*/, , secret] =
      e.valueSource.secretKeyRef.secret.split("/");
    return {
      key: e.name,
      projectId,
      secret,
      version: e.valueSource.secretKeyRef.version || "latest",
    };
  });
  return endpoint;
}

export function serviceFromEndpoint(
  endpoint: backend.Endpoint,
  image: string,
): Omit<Service, ServiceOutputFields> {
  const labels: Record<string, string> = {
    ...endpoint.labels,
    ...(endpoint.runtime ? { [RUNTIME_LABEL]: endpoint.runtime } : {}),
    [CLIENT_NAME_LABEL]: "firebase-functions",
  };

  // A bit of a hack, but other code assumes the Functions method of indicating deployment tool and
  // injects this as a label. To avoid thinking that this is actually meaningful in the CRF world,
  // we delete it here.
  delete labels["deployment-tool"];

  // TODO: hash
  if (endpoint.codebase) {
    labels[CODEBASE_LABEL] = endpoint.codebase;
  }

  const annotations: Record<string, string> = {
    [FIREBASE_FUNCTION_METADTA_ANNOTATION]: JSON.stringify({
      functionId: endpoint.id,
    }),
  };

  const template: RevisionTemplate = {
    containers: [
      {
        name: "worker",
        image,
        env: [
          ...Object.entries(endpoint.environmentVariables || {}).map(([name, value]) => ({
            name,
            value,
          })),
          ...(endpoint.secretEnvironmentVariables || []).map((secret) => ({
            name: secret.key,
            valueSource: {
              secretKeyRef: {
                secret: secret.secret,
                version: secret.version,
              },
            },
          })),
          {
            name: FUNCTION_TARGET_ENV,
            value: endpoint.entryPoint,
          },
          {
            name: FUNCTION_SIGNATURE_TYPE_ENV,
            value: backend.isEventTriggered(endpoint) ? "cloudevent" : "http",
          },
        ],
        resources: {
          limits: {
            cpu: String(endpoint.cpu || 1),
            memory: `${endpoint.availableMemoryMb || 256}Mi`,
          },
          cpuIdle: true,
          startupCpuBoost: true,
        },
      },
    ],
    containerConcurrency: endpoint.concurrency || backend.DEFAULT_CONCURRENCY,
  };
  proto.renameIfPresent(template, endpoint, "containerConcurrency", "concurrency");

  const service: Omit<Service, ServiceOutputFields> = {
    name: `projects/${endpoint.project}/locations/${endpoint.region}/services/${functionNameToServiceName(
      endpoint.id,
    )}`,
    labels,
    annotations,
    template,
    client: "cli-firebase",
  };

  if (endpoint.minInstances || endpoint.maxInstances) {
    service.scaling = {};
    proto.renameIfPresent(service.scaling, endpoint, "minInstanceCount", "minInstances");
    proto.renameIfPresent(service.scaling, endpoint, "maxInstanceCount", "maxInstances");
  }

  // TODO: other trigger types, service accounts, concurrency, etc.
  return service;
}
