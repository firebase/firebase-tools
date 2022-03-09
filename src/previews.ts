import { has, set } from "lodash";
import { configstore } from "./configstore";

interface PreviewFlags {
  rtdbrules: boolean;
  ext: boolean;
  extdev: boolean;
  extensionsemulator: boolean;
  rtdbmanagement: boolean;
  functionsv2: boolean;
  golang: boolean;
  python: boolean;
  deletegcfartifacts: boolean;
  artifactregistry: boolean;
  emulatoruisnapshot: boolean;
}

export const previews: PreviewFlags = {
  // insert previews here...
  rtdbrules: false,
  ext: false,
  extdev: false,
  extensionsemulator: false,
  rtdbmanagement: false,
  functionsv2: false,
  golang: false,
  python: false,
  deletegcfartifacts: false,
  artifactregistry: false,
  emulatoruisnapshot: false,

  ...(configstore.get("previews") as Partial<PreviewFlags>),
};

if (process.env.FIREBASE_CLI_PREVIEWS) {
  process.env.FIREBASE_CLI_PREVIEWS.split(",").forEach((feature) => {
    if (has(previews, feature)) {
      set(previews, feature, true);
    }
  });
}
