import { hostingApiOrigin } from "../../api.cjs";
import { Client } from "../../apiv2.js";

export const client = new Client({
  urlPrefix: hostingApiOrigin,
  apiVersion: "v1beta1",
});
