import * as hash from "../../../../deploy/functions/cache/hash";
import { applyBackendHashToBackends } from "../../../../deploy/functions/cache/applyHash";
import * as backend from "../../../../deploy/functions/backend";
import { expect } from "chai";
import * as sinon from "sinon";

const EMPTY_ENDPOINT: backend.Endpoint = {
  id: "id",
  region: "region",
  project: "project",
  platform: "gcfv2",
  runtime: "nodejs16",
  entryPoint: "ep",
  httpsTrigger: {},
  secretEnvironmentVariables: [],
};

describe("applyHash", () => {
  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("applyBackendHashToBackends", () => {
    it("should applyHash to each endpoint of a given backend", async () => {
      // Prepare
      const context = {
        projectId: "projectId",
        sources: {
          backend1: {
            functionsSourceV1: "backend1_sourceV1",
            functionsSourceV2: "backend1_sourceV2",
          },
          backend2: {
            functionsSourceV1: "backend2_sourceV1",
            functionsSourceV2: "backend2_sourceV2",
          },
        },
      };
      const endpoint1: backend.Endpoint = {
        ...EMPTY_ENDPOINT,
        id: "endpoint1",
        platform: "gcfv1",
        codebase: "backend1",
        secretEnvironmentVariables: [
          {
            key: "key",
            secret: "secret1",
            projectId: "projectId",
            version: "1",
          },
        ],
      };
      const endpoint2: backend.Endpoint = {
        ...EMPTY_ENDPOINT,
        id: "endpoint2",
        platform: "gcfv2",
        codebase: "backend2",
        secretEnvironmentVariables: [
          {
            key: "key",
            secret: "secret2",
            projectId: "projectId",
            version: "2",
          },
        ],
      };

      const backend1 = backend.of(endpoint1);
      const backend2 = backend.of(endpoint2);

      backend1.environmentVariables.test = "backend1_env_hash";
      backend2.environmentVariables.test = "backend2_env_hash";

      const backends = { backend1, backend2 };

      const getSourceHash = sinon.stub(hash, "getSourceHash");
      getSourceHash.callsFake((path: string) => Promise.resolve("source=" + path));

      const getEnvironmentVariablesHash = sinon.stub(hash, "getEnvironmentVariablesHash");
      getEnvironmentVariablesHash.callsFake(
        (backend: backend.Backend) => "env=" + backend.environmentVariables.test
      );
      const getSecretsHash = sinon.stub(hash, "getSecretsHash");
      getSecretsHash.callsFake(
        (endpoint: backend.Endpoint) => "secret=" + endpoint.secretEnvironmentVariables?.[0].secret
      );

      const getEndpointHash = sinon.stub(hash, "getEndpointHash");
      getEndpointHash.callsFake((source?: string, env?: string, secrets?: string) =>
        [source, env, secrets].join("&")
      );

      // Execute
      await applyBackendHashToBackends(backends, context);

      // Expect
      expect(getEndpointHash).to.have.been.calledWith(
        "source=backend1_sourceV1",
        "env=backend1_env_hash",
        "secret=secret1"
      );
      expect(endpoint1.hash).to.equal(
        "source=backend1_sourceV1&env=backend1_env_hash&secret=secret1"
      );
      expect(getEndpointHash).to.have.been.calledWith(
        "source=backend2_sourceV2",
        "env=backend2_env_hash",
        "secret=secret2"
      );
      expect(endpoint2.hash).to.equal(
        "source=backend2_sourceV2&env=backend2_env_hash&secret=secret2"
      );
      expect(getEnvironmentVariablesHash).to.have.been.calledWith(backend1);
      expect(getEnvironmentVariablesHash).to.have.been.calledWith(backend2);
    });
  });
});
