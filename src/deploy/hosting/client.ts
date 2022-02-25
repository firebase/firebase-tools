import { hostingApiOrigin } from "../../api";
import { Client } from "../../apiv2";

export const client = new Client({
  urlPrefix: hostingApiOrigin,
  apiVersion: "v1beta1",
});
