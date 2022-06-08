import lodash from "lodash";
const { has, set } = lodash;
import { configstore } from "./configstore.js";

interface PreviewFlags {
  rtdbrules: boolean;
  ext: boolean;
  extdev: boolean;
  rtdbmanagement: boolean;
  golang: boolean;
  deletegcfartifacts: boolean;
  artifactregistry: boolean;
  emulatoruisnapshot: boolean;
  frameworkawareness: boolean;
  functionsparams: boolean;
}

export const previews: PreviewFlags = {
  // insert previews here...
  rtdbrules: false,
  ext: false,
  extdev: false,
  rtdbmanagement: false,
  golang: false,
  deletegcfartifacts: false,
  artifactregistry: false,
  emulatoruisnapshot: false,
  frameworkawareness: false,
  functionsparams: false,

  ...(configstore.get("previews") as Partial<PreviewFlags>),
};

if (process.env.FIREBASE_CLI_PREVIEWS) {
  process.env.FIREBASE_CLI_PREVIEWS.split(",").forEach((feature) => {
    if (has(previews, feature)) {
      set(previews, feature, true);
    }
  });
}
