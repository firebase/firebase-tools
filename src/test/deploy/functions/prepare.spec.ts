import { expect } from "chai";

import * as backend from "../../../deploy/functions/backend";
import * as prepare from "../../../deploy/functions/prepare";

describe("prepare", () => {
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

  describe("inferDetailsFromExisting", () => {
    it("merges env vars if .env is not used", () => {
      const oldE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "old value",
          old: "value",
        },
      };
      const newE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "new value",
          new: "value",
        },
      };

      prepare.inferDetailsFromExisting(backend.of(newE), backend.of(oldE), /* usedDotenv= */ false);

      expect(newE.environmentVariables).to.deep.equals({
        old: "value",
        new: "value",
        foo: "new value",
      });
    });

    it("overwrites env vars if .env is used", () => {
      const oldE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "old value",
          old: "value",
        },
      };
      const newE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "new value",
          new: "value",
        },
      };

      prepare.inferDetailsFromExisting(backend.of(newE), backend.of(oldE), /* usedDotEnv= */ true);

      expect(newE.environmentVariables).to.deep.equals({
        new: "value",
        foo: "new value",
      });
    });

    it("can noop when there is no prior endpoint", () => {
      const e = { ...ENDPOINT };
      prepare.inferDetailsFromExisting(backend.of(e), backend.of(), /* usedDotEnv= */ false);
      expect(e).to.deep.equal(ENDPOINT);
    });

    it("can fill in regions from last deploy", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "bucket" },
          retry: false,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint & backend.EventTriggered = JSON.parse(JSON.stringify(want));
      have.eventTrigger.region = "us";

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.eventTrigger.region).to.equal("us");
    });

    it("doesn't fill in regions if triggers changed", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalzied",
          eventFilters: { bucket: "us-bucket" },
          retry: false,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint & backend.EventTriggered = JSON.parse(JSON.stringify(want));
      have.eventTrigger.eventFilters = { bucket: "us-central1-bucket" };
      have.eventTrigger.region = "us-central1";

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.eventTrigger.region).to.be.undefined;
    });

    it("fills in instance size", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint = JSON.parse(JSON.stringify(want));
      have.availableMemoryMb = 512;

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.availableMemoryMb).to.equal(512);
    });
  });

  describe("groupByCodebase", () => {
    function endpointsOf(b: backend.Backend): string[] {
      return backend.allEndpoints(b).map((e) => `${e.region}-${e.id}`);
    }

    it("groups codebase using codebase property", () => {
      const wantBackends: Record<string, backend.Backend> = {
        default: backend.of(
          { ...ENDPOINT, id: "default-0", codebase: "default" },
          { ...ENDPOINT, id: "default-1", codebase: "default" }
        ),
        cb: backend.of(
          { ...ENDPOINT, id: "cb-0", codebase: "cb" },
          { ...ENDPOINT, id: "cb-1", codebase: "cb" }
        ),
      };
      const haveBackend = backend.of(
        { ...ENDPOINT, id: "default-0", codebase: "default" },
        { ...ENDPOINT, id: "default-1", codebase: "default" },
        { ...ENDPOINT, id: "cb-0", codebase: "cb" },
        { ...ENDPOINT, id: "cb-1", codebase: "cb" },
        { ...ENDPOINT, id: "orphan", codebase: "orphan" }
      );

      const got = prepare.groupByCodebase(wantBackends, haveBackend);
      for (const codebase of Object.keys(got)) {
        expect(endpointsOf(got[codebase])).to.have.members(endpointsOf(wantBackends[codebase]));
      }
    });

    it("claims endpoint with matching name with conflicting codebase property", () => {
      const wantBackends: Record<string, backend.Backend> = {
        default: backend.of(
          { ...ENDPOINT, id: "default-0", codebase: "default" },
          { ...ENDPOINT, id: "default-1", codebase: "default" }
        ),
        cb: backend.of(
          { ...ENDPOINT, id: "cb-0", codebase: "cb" },
          { ...ENDPOINT, id: "cb-1", codebase: "cb" }
        ),
      };
      const haveBackend = backend.of(
        { ...ENDPOINT, id: "default-0", codebase: "cb" },
        { ...ENDPOINT, id: "default-1", codebase: "cb" },
        { ...ENDPOINT, id: "cb-0", codebase: "cb" },
        { ...ENDPOINT, id: "cb-1", codebase: "cb" },
        { ...ENDPOINT, id: "orphan", codebase: "orphan" }
      );

      const got = prepare.groupByCodebase(wantBackends, haveBackend);
      for (const codebase of Object.keys(got)) {
        expect(endpointsOf(got[codebase])).to.have.members(endpointsOf(wantBackends[codebase]));
      }
    });
  });
});
