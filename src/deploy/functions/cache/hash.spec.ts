import { expect } from "chai";
import {
  getEnvironmentVariablesHash,
  getEndpointHash,
  getSecretsHash,
  getSourceHash,
} from "./hash";
import { Endpoint, empty } from "../backend";
import { resolve } from "path";

const EMPTY_WANT_BACKEND = empty();

const EMPTY_ENDPOINT: Endpoint = {
  id: "id",
  region: "region",
  project: "project",
  platform: "gcfv2",
  runtime: "nodejs16",
  entryPoint: "ep",
  httpsTrigger: {},
  secretEnvironmentVariables: [
    {
      key: "key",
      secret: "secret",
      projectId: "projectId",
      version: "1",
    },
  ],
};

describe("getBackendHash", () => {
  describe("getEnvironmentVariablesHash", () => {
    it("should return different hash given different env variables", () => {
      const backend1 = {
        ...EMPTY_WANT_BACKEND,
        environmentVariables: {
          PROJECT: "v1",
        },
      };
      const backend2 = {
        ...EMPTY_WANT_BACKEND,
        environmentVariables: {
          PROJECT: "v2",
        },
      };
      const hash1 = getEnvironmentVariablesHash(backend1);
      const hash2 = getEnvironmentVariablesHash(backend2);

      expect(hash1).to.not.equal(hash2);
    });

    it("should return same hash given same env variables", () => {
      const backend1 = {
        ...EMPTY_WANT_BACKEND,
        environmentVariables: {
          PROJECT: "v0",
        },
      };
      const backend2 = {
        ...EMPTY_WANT_BACKEND,
        environmentVariables: {
          PROJECT: "v0",
        },
      };
      const hash1 = getEnvironmentVariablesHash(backend1);
      const hash2 = getEnvironmentVariablesHash(backend2);

      expect(hash1).to.equal(hash2);
    });
  });

  describe("getSecretsHash", () => {
    it("should return different hash given different secret versions", () => {
      const endpoint1 = {
        ...EMPTY_ENDPOINT,
        secretEnvironmentVariables: [
          {
            key: "key_same",
            secret: "secret_same",
            projectId: "projectId",
            version: "1",
          },
          {
            key: "key_test",
            secret: "secret_test",
            projectId: "projectId",
            version: "1",
          },
        ],
      };
      const endpoint2 = {
        ...EMPTY_ENDPOINT,
        secretEnvironmentVariables: [
          {
            key: "key_same",
            secret: "secret_same",
            projectId: "projectId",
            version: "1",
          },
          {
            key: "key_test",
            secret: "secret_test",
            projectId: "projectId",
            version: "2", // different from backend1
          },
        ],
      };
      const hash1 = getSecretsHash(endpoint1);
      const hash2 = getSecretsHash(endpoint2);

      expect(hash1).to.not.equal(hash2);
    });

    it("should return same hash given same secret versions", () => {
      const endpoint1 = {
        ...EMPTY_ENDPOINT,
        secretEnvironmentVariables: [
          {
            key: "key_same",
            secret: "secret_same",
            projectId: "projectId",
            version: "1",
          },
          {
            key: "key_test",
            secret: "secret_test",
            projectId: "projectId",
            version: "1",
          },
        ],
      };
      const endpoint2 = {
        ...EMPTY_ENDPOINT,
        secretEnvironmentVariables: [
          {
            key: "key_same",
            secret: "secret_same",
            projectId: "projectId",
            version: "1",
          },
          {
            key: "key_test",
            secret: "secret_test",
            projectId: "projectId",
            version: "1",
          },
        ],
      };
      const hash1 = getSecretsHash(endpoint1);
      const hash2 = getSecretsHash(endpoint2);

      expect(hash1).to.equal(hash2);
    });
  });

  describe("getSourceHash", () => {
    it("should return different hash given different files", async () => {
      const file1 = resolve("./mockdata/function_source_v1.txt");
      const file2 = resolve("./mockdata/function_source_v2.txt");

      const hash1 = await getSourceHash(file1);
      const hash2 = await getSourceHash(file2);

      expect(hash1).to.not.equal(hash2);
    });

    it("should return the same hash given the same file", async () => {
      const file1 = resolve("./mockdata/function_source_v1.txt");
      const file2 = resolve("./mockdata/function_source_v1.txt");

      const hash1 = await getSourceHash(file1);
      const hash2 = await getSourceHash(file2);

      expect(hash1).to.equal(hash2);
    });
  });

  describe("getEndpointHash", () => {
    it("should return different hash given hashes", () => {
      const sourceHash1 = "sourceHash1";
      const envHash1 = "envHash1";
      const secretHash1 = "secretHash1";

      const sourceHash2 = "sourceHash2";
      const envHash2 = "envHash2";
      const secretHash2 = "secretHash2";

      const hash1 = getEndpointHash(sourceHash1, envHash1, secretHash1);
      const hash2 = getEndpointHash(sourceHash2, envHash2, secretHash2);

      expect(hash1).to.not.equal(hash2);
    });

    it("should return different hash given partial difference", () => {
      const sourceHash1 = "sourceHash";
      const envHash1 = "envHash";
      const secretHash1 = "secretHash1";

      const sourceHash2 = "sourceHash";
      const envHash2 = "envHash";
      const secretHash2 = "secretHash2";

      const hash1 = getEndpointHash(sourceHash1, envHash1, secretHash1);
      const hash2 = getEndpointHash(sourceHash2, envHash2, secretHash2);

      expect(hash1).to.not.equal(hash2);
    });

    it("should return same hash given same hashes", () => {
      const sourceHash1 = "sourceHash";
      const envHash1 = "envHash";
      const secretHash1 = "secretHash";

      const sourceHash2 = "sourceHash";
      const envHash2 = "envHash";
      const secretHash2 = "secretHash";

      const hash1 = getEndpointHash(sourceHash1, envHash1, secretHash1);
      const hash2 = getEndpointHash(sourceHash2, envHash2, secretHash2);

      expect(hash1).to.equal(hash2);
    });

    it("should filter out undefined hashes", () => {
      // hash1 + hash2 === hash1 + hash2
      const hash1 = getEndpointHash("hash1", undefined, "hash2");
      const hash2 = getEndpointHash("hash1", "hash2", undefined);

      expect(hash1).to.equal(hash2);
    });
  });
});
