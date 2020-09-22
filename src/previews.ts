import { has, set } from "lodash";
import { configstore } from "./configstore";

interface PreviewFlags {
  rtdbrules: boolean;
  ext: boolean;
  extdev: boolean;
  hostingchannels: boolean;
  rtdbmanagement: boolean;
  authemulator: boolean;
}

export const previews: PreviewFlags = Object.assign(
  {
    // insert previews here...
    rtdbrules: false,
    ext: false,
    extdev: false,
    hostingchannels: false,
    rtdbmanagement: false,
    authemulator: false,
  },
  configstore.get("previews")
);

if (process.env.FIREBASE_CLI_PREVIEWS) {
  process.env.FIREBASE_CLI_PREVIEWS.split(",").forEach((feature) => {
    if (has(previews, feature)) {
      set(previews, feature, true);
    }
  });
}
