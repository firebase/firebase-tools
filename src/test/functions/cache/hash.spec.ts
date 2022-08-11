import { expect } from "chai";
import { getBackendHash } from "../../../deploy/functions/cache/hash";
import { Backend } from "../../../deploy/functions/backend";
import { resolve } from "path";
import { Endpoint } from "../../../deploy/functions/backend";

const EMPTY_WANT_BACKEND = {
  requiredAPIs: [],
  environmentVariables: {},
  endpoints: {},
} as Backend;

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
  it("should return different hash given different env variables", async () => {
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
    const hash1 = await getBackendHash(backend1);
    const hash2 = await getBackendHash(backend2);

    expect(hash1).to.not.equal(hash2);
  });

  it("should return same hash given same env variables", async () => {
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
    const hash1 = await getBackendHash(backend1);
    const hash2 = await getBackendHash(backend2);

    expect(hash1).to.equal(hash2);
  });

  it("should return different hash given different secret versions", async () => {
    const backend1 = {
      ...EMPTY_WANT_BACKEND,
      endpoints: {
        region: {
          id: {
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
          },
        },
      },
    };
    const backend2 = {
      ...EMPTY_WANT_BACKEND,
      endpoints: {
        region: {
          id: {
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
          },
        },
      },
    };
    const hash1 = await getBackendHash(backend1);
    const hash2 = await getBackendHash(backend2);

    expect(hash1).to.not.equal(hash2);
  });

  it("should return same hash given same secret versions", async () => {
    const backend1 = {
      ...EMPTY_WANT_BACKEND,
      endpoints: {
        region: {
          id: {
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
          },
        },
      },
    };
    const backend2 = {
      ...EMPTY_WANT_BACKEND,
      endpoints: {
        region: {
          id: {
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
                version: "1", // same as backend1
              },
            ],
          },
        },
      },
    };
    const hash1 = await getBackendHash(backend1);
    const hash2 = await getBackendHash(backend2);

    expect(hash1).to.equal(hash2);
  });

  it("should return different hash given different files", async () => {
    const file1 = resolve("./mockdata/function_source_v1.txt");
    const file2 = resolve("./mockdata/function_source_v2.txt");

    const source1 = { functionsSourceV1: file1 };
    const source2 = { functionsSourceV1: file2 };

    const hash1 = await getBackendHash(EMPTY_WANT_BACKEND, source1);
    const hash2 = await getBackendHash(EMPTY_WANT_BACKEND, source2);

    expect(hash1).to.not.equal(hash2);
  });

  it("should return the same hash given the same file", async () => {
    const file1 = resolve("./mockdata/function_source_v1.txt");
    const file2 = resolve("./mockdata/function_source_v1.txt");

    const source1 = { functionsSourceV1: file1 };
    const source2 = { functionsSourceV1: file2 };

    const hash1 = await getBackendHash(EMPTY_WANT_BACKEND, source1);
    const hash2 = await getBackendHash(EMPTY_WANT_BACKEND, source2);

    expect(hash1).to.equal(hash2);
  });
});
