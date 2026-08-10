import { setGlobalOptions } from "firebase-functions";
import * as params from "firebase-functions/params";

export const regionParam = params.defineString("FUNCTION_KIT_REGION", {
  description: "Region where functions should be deployed.",
});

// To require setting a global option for each instance of this kit, uncomment the option parameter
// definition and the line configuring it below. Learn more about these options at:
// https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.globaloptions

// export const concurrencyParam = params.defineInt("FIREBASE_FUNCTION_KIT_CONCURRENCY", {
//   description: "Number of concurrent requests a function instance can serve simultaneously.",
// });

// export const cpuParam = params.defineFloat("FIREBASE_FUNCTION_KIT_CPU", {
//   description: "Fractional number of CPUs to allocate to a function.",
// });

// export const enforceAppCheckParam = params.defineBoolean("FIREBASE_FUNCTION_KIT_ENFORCE_APP_CHECK", {
//   description: "Controls whether Firebase App Check is enforced.",
// });

// export const ingressSettingsParam = params.defineString("FIREBASE_FUNCTION_KIT_INGRESS_SETTINGS", {
//   description: "Ingress settings to control network traffic sources (ALLOW_ALL, ALLOW_INTERNAL_ONLY, ALLOW_INTERNAL_AND_GCLB).",
// });

// export const invokerParam = params.defineString("FIREBASE_FUNCTION_KIT_INVOKER", {
//   description: "Access control for HTTPS functions (e.g. 'public' or service account email).",
// });

// export const labelsParam = params.defineJson("FIREBASE_FUNCTION_KIT_LABELS", {
//   description: "User-defined labels (JSON object) to set on the function.",
// });

// export const maxInstancesParam = params.defineInt("FIREBASE_FUNCTION_KIT_MAX_INSTANCES", {
//   description: "Maximum number of instances that can run in parallel.",
// });

// export const memoryParam = params.defineString("FIREBASE_FUNCTION_KIT_MEMORY", {
//   description: "Amount of memory to allocate to the function (e.g. 256MiB, 512MiB, 1GiB, 2GiB).",
// });

// export const minInstancesParam = params.defineInt("FIREBASE_FUNCTION_KIT_MIN_INSTANCES", {
//   description: "Minimum number of idle instances to keep running.",
// });

// export const omitParam = params.defineBoolean("FIREBASE_FUNCTION_KIT_OMIT", {
//   description: "If true, do not deploy or emulate these functions.",
// });

// export const preserveExternalChangesParam = params.defineBoolean("FIREBASE_FUNCTION_KIT_PRESERVE_EXTERNAL_CHANGES", {
//   description: "If true, preserves configuration modified outside of function source code.",
// });

// export const secretParam = params.defineSecret("MY_SECRET");

// export const serviceAccountParam = params.defineString("FIREBASE_FUNCTION_KIT_SERVICE_ACCOUNT", {
//   description: "Specific service account email for the function to run as.",
// });

// export const timeoutSecondsParam = params.defineInt("FIREBASE_FUNCTION_KIT_TIMEOUT_SECONDS", {
//   description: "Timeout for the function in seconds (0 to 540 for event functions, up to 3600 for HTTPS).",
// });

// export const vpcConnectorParam = params.defineString("FIREBASE_FUNCTION_KIT_VPC_CONNECTOR", {
//   description: "The VPC connector to connect the function to.",
// });

// export const vpcConnectorEgressSettingsParam = params.defineString("FIREBASE_FUNCTION_KIT_VPC_CONNECTOR_EGRESS_SETTINGS", {
//   description: "Egress settings for VPC connector (PRIVATE_RANGES_ONLY or ALL_TRAFFIC).",
// });

setGlobalOptions({
  region: regionParam,
  // concurrency: concurrencyParam,
  // cpu: cpuParam,
  // enforceAppCheck: enforceAppCheckParam,
  // ingressSettings: ingressSettingsParam,
  // invoker: invokerParam,
  // labels: labelsParam,
  // maxInstances: maxInstancesParam,
  // memory: memoryParam,
  // minInstances: minInstancesParam,
  // omit: omitParam,
  // preserveExternalChanges: preserveExternalChangesParam,
  // secrets: [secretParam],
  // serviceAccount: serviceAccountParam,
  // timeoutSeconds: timeoutSecondsParam,
  // vpcConnector: vpcConnectorParam,
  // vpcConnectorEgressSettings: vpcConnectorEgressSettingsParam,
});

export * from "{{PACKAGE_NAME}}";