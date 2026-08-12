/**
 *  This exports all functions in the kit so that the Firebase CLI can see it. The
 *  kit may expose additional, optional features that you can configure after importing,
 *  such as registering a callback. Check the kit's README for more information.
 */

import { setGlobalOptions } from "firebase-functions";
import * as params from "firebase-functions/params";

// This is how you create a "param". A param is a placeholder for a value
// which is determined at install/deploy time. Use a param whenever you want
// the value to differ. Learn more at
// https://firebase.google.com/docs/functions/config-env#params
export const regionParam = params.defineString("FUNCTION_DEFAULT_REGION", {
  description: "Global default region where functions should be deployed. Can be overriden per-function.",
});


// This allows you to set default options that apply to all functions in this
// kit. Learn more about these options and additional configurations at:
// https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.globaloptions
setGlobalOptions({
  // If you pass a parameter, you will be prompted for new values on each instance.
  region: regionParam,
  // If you want the same value for all instances across your kit, you can pass a
  // normal value.
  // For cost control, you can set the maximum number of containers that can be
  // running at the same time. This helps mitigate the impact of unexpected
  // traffic spikes by instead downgrading performance. This limit is a
  // per-function limit.
  maxInstances: 10,
});

// Exports the functions located in the kit.
export * from "{{PACKAGE_NAME}}";
