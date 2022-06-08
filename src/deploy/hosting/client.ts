import apiv1Pkg from "../../api.cjs";
const { hostingApiOrigin } = apiv1Pkg;
import { Client } from "../../apiv2.js";

export const client = new Client({
  urlPrefix: hostingApiOrigin,
  apiVersion: "v1beta1",
});
