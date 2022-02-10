import { has, set } from "lodash";
import { configstore } from "./configstore";

interface PreviewFlags {
  rtdbrules: boolean;
  ext: boolean;
  extdev: boolean;
  rtdbmanagement: boolean;
  functionsv2: boolean;
  golang: boolean;
  deletegcfartifacts: boolean;
  artifactregistry: boolean;
}

export const previews: PreviewFlags = {
  // insert previews here...
  rtdbrules: false,
  ext: false,
  extdev: false,
  rtdbmanagement: false,
  functionsv2: false,
  golang: false,
  deletegcfartifacts: false,
  artifactregistry: false,

  ...(configstore.get("previews") as Partial<PreviewFlags>),
};

if (process.env.FIREBASE_CLI_PREVIEWS) {
  process.env.FIREBASE_CLI_PREVIEWS.split(",").forEach((feature) => {
    if (has(previews, feature)) {
      set(previews, feature, true);
    }
  });
}
