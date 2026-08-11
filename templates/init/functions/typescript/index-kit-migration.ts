/**
 * Export functions from a function kit.
 * 
 * This template is intended for users migrating from using a Firebase
 * Extension to its equivalent function kit. It will set the global options for
 * the function kit to equal what is configured for the Extension instance.
 * Configuration from the Extension instance to migrate can be exported using
 * the `firebase ext:export --mode functions --instance <ext-instance-id>`
 * command.
 */

import { setGlobalOptions } from "firebase-functions";
import { MemoryOption, VpcEgressSetting, IngressSetting } from "firebase-functions/v2/options";
import * as params from "firebase-functions/params";

export const regionParam = params.defineString("FUNCTION_DEFAULT_REGION", {
  description: "Region where functions should be deployed.",
});

// This allows you to set default options that apply to all functions in this
// kit. Learn more about these options and additional configurations at:
// https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.globaloptions
setGlobalOptions({
  region: regionParam,
  memory: (process.env.EXT_MIGRATED_SYSTEM_MEMORY as MemoryOption) || undefined,
  timeoutSeconds: process.env.EXT_MIGRATED_SYSTEM_TIMEOUTSECONDS
    ? Number(process.env.EXT_MIGRATED_SYSTEM_TIMEOUTSECONDS)
    : undefined,
  vpcConnectorEgressSettings:
    (process.env.EXT_MIGRATED_SYSTEM_VPCCONNECTOREGRESSSETTINGS as VpcEgressSetting) || undefined,
  vpcConnector: process.env.EXT_MIGRATED_SYSTEM_VPCCONNECTOR || undefined,
  maxInstances: process.env.EXT_MIGRATED_SYSTEM_MAXINSTANCES
    ? Number(process.env.EXT_MIGRATED_SYSTEM_MAXINSTANCES)
    : undefined,
  minInstances: process.env.EXT_MIGRATED_SYSTEM_MININSTANCES
    ? Number(process.env.EXT_MIGRATED_SYSTEM_MININSTANCES)
    : undefined,
  ingressSettings: (process.env.EXT_MIGRATED_SYSTEM_INGRESSSETTINGS as IngressSetting) || undefined,
  labels: process.env.EXT_MIGRATED_SYSTEM_LABELS
    ? JSON.parse(process.env.EXT_MIGRATED_SYSTEM_LABELS)
    : undefined,
});

// Exports the functions located in the kit.
export * from "{{PACKAGE_NAME}}";
