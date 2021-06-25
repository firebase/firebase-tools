import { has, set } from "lodash";
import { configstore } from "./configstore";

interface PreviewFlags {
  rtdbrules: boolean;
  ext: boolean;
  extdev: boolean;
  rtdbmanagement: boolean;
  functionsv2: boolean;
  golang: boolean;
}

export const previews: PreviewFlags = {
  // insert previews here...
  rtdbrules: false,
  ext: false,
  extdev: false,
  rtdbmanagement: false,
  functionsv2: false,
  golang: false,

  ...configstore.get("previews"),
};

if (process.env.FIREBASE_CLI_PREVIEWS) {
  process.env.FIREBASE_CLI_PREVIEWS.split(",").forEach((feature) => {
    if (has(previews, feature)) {
      set(previews, feature, true);
    }
  });
}
