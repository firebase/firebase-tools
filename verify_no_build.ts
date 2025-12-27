
import { buildFromV1Alpha1 } from "./lib/deploy/functions/runtimes/discovery/v1alpha1";
import * as build from "./lib/deploy/functions/build";
import { expect } from "chai";

const yaml = {
  specVersion: "v1alpha1",
  endpoints: {
    darttest: {
      platform: "run", // --no-build
      region: ["us-west1"],
      httpsTrigger: {}, // --allow-unauthenticated
      baseImageUri: "us-west1-docker.pkg.dev/serverless-runtimes/google-22-full/runtimes/go123", // --base-image
      command: ["./bin/server.exe"], // --command
      entryPoint: "server", // Required by internal logic even if ignored by no-build?
    },
  },
};

console.log("Parsing dummy functions.yaml...");
try {
  // @ts-ignore
  const result = buildFromV1Alpha1(yaml, "danielylee-91", "us-west1", "dart");
  console.log("Result endpoints:", JSON.stringify(result.endpoints, null, 2));

  // @ts-ignore
  const endpoint = (result.endpoints as any)["darttest"];

  if (!endpoint) {
    console.error("FAILED: Endpoint not found in result");
    process.exit(1);
  }

  console.log("SUCCESS: Endpoint parsed successfully!");
  console.log("Platform:", endpoint.platform);
  console.log("Base Image:", endpoint.baseImageUri);
  console.log("Command:", endpoint.command);

  if (endpoint.platform !== "run") throw new Error("Wrong platform");
  if (endpoint.baseImageUri !== "us-west1-docker.pkg.dev/serverless-runtimes/google-22-full/runtimes/go123") throw new Error("Wrong base image");
  if (!endpoint.command || endpoint.command[0] !== "./bin/server.exe") throw new Error("Wrong command");

  console.log("Verification PASSED.");
} catch (e) {
  console.error("FAILED:", e);
  process.exit(1);
}
