import { expect } from "chai";

import * as args from "../../../deploy/functions/args";
import * as backend from "../../../deploy/functions/backend";
import * as deploy from "../../../deploy/functions/deploy";

describe("deploy", () => {
  const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "gcfv2",
    id: "id",
    region: "region",
    project: "project",
    entryPoint: "entry",
    runtime: "nodejs16",
  };

  const ENDPOINT: backend.Endpoint = {
    ...ENDPOINT_BASE,
    httpsTrigger: {},
  };

  const CONTEXT: args.Context = {
    projectId: "project",
  };

  describe("shouldUploadBeSkipped", () => {
    let endpoint1InWantBackend: backend.Endpoint;
    let endpoint2InWantBackend: backend.Endpoint;
    let endpoint1InHaveBackend: backend.Endpoint;
    let endpoint2InHaveBackend: backend.Endpoint;

    let wantBackend: backend.Backend;
    let haveBackend: backend.Backend;

    beforeEach(() => {
      endpoint1InWantBackend = {
        ...ENDPOINT,
        id: "endpoint1",
        platform: "gcfv1",
        codebase: "backend1",
      };
      endpoint2InWantBackend = {
        ...ENDPOINT,
        id: "endpoint2",
        platform: "gcfv1",
        codebase: "backend1",
      };
      endpoint1InHaveBackend = {
        ...ENDPOINT,
        id: "endpoint1",
        platform: "gcfv2",
        codebase: "backend2",
      };
      endpoint2InHaveBackend = {
        ...ENDPOINT,
        id: "endpoint2",
        platform: "gcfv2",
        codebase: "backend2",
      };

      wantBackend = backend.of(endpoint1InWantBackend, endpoint2InWantBackend);
      haveBackend = backend.of(endpoint1InHaveBackend, endpoint2InHaveBackend);
    });

    it("should skip if all endpoints are identical", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = endpoint2InWantBackend.hash;

      // Execute
      const result = deploy.shouldUploadBeSkipped(CONTEXT, wantBackend, haveBackend);

      // Expect
      expect(result).to.be.true;
    });

    it("should not skip if hashes don't match", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = "No_match";

      // Execute
      const result = deploy.shouldUploadBeSkipped(CONTEXT, wantBackend, haveBackend);

      // Expect
      expect(result).to.be.false;
    });

    it("should not skip if haveBackend is missing", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = endpoint2InWantBackend.hash;

      wantBackend = backend.of(endpoint1InWantBackend, endpoint2InWantBackend);
      haveBackend = backend.of(endpoint1InHaveBackend);

      // Execute
      const result = deploy.shouldUploadBeSkipped(CONTEXT, wantBackend, haveBackend);

      // Expect
      expect(result).to.be.false;
    });

    it("should not skip if wantBackend is missing", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = endpoint2InWantBackend.hash;

      wantBackend = backend.of(endpoint1InWantBackend);
      haveBackend = backend.of(endpoint1InHaveBackend, endpoint2InHaveBackend);

      // Execute
      const result = deploy.shouldUploadBeSkipped(CONTEXT, wantBackend, haveBackend);

      // Expect
      expect(result).to.be.false;
    });

    it("should not skip if endpoint filter is specified", () => {
      endpoint1InWantBackend.hash = "1";
      endpoint2InWantBackend.hash = "2";
      endpoint1InHaveBackend.hash = endpoint1InWantBackend.hash;
      endpoint2InHaveBackend.hash = endpoint2InWantBackend.hash;

      // Execute
      const result = deploy.shouldUploadBeSkipped(
        { ...CONTEXT, filters: [{ idChunks: ["foobar"] }] },
        wantBackend,
        haveBackend,
      );

      // Expect
      expect(result).to.be.false;
    });
  });
});
