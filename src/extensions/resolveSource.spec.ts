import { expect } from "chai";
import * as nock from "nock";

import { getExtensionRegistry } from "./resolveSource";
import { firebaseExtensionsRegistryOrigin } from "../api";

describe("resolveSource", () => {
  const registryOrigin = firebaseExtensionsRegistryOrigin();
  afterEach(() => {
    nock.cleanAll();
  });

  describe("getExtensionRegistry", () => {
    it("should return the full extension registry", async () => {
      const expectedRegistry = {
        "ext-1": {
          publisher: "test-publisher",
        },
        "ext-2": {
          publisher: "test-publisher",
        },
      };
      nock(registryOrigin).get("/extensions.json").reply(200, { mods: expectedRegistry });

      const registry = await getExtensionRegistry();

      expect(registry).to.deep.equal(expectedRegistry);
      expect(nock.isDone()).to.be.true;
    });

    it("should return only the featured extensions if onlyFeatured is true", async () => {
      const registry = {
        "ext-1": {
          publisher: "test-publisher",
        },
        "ext-2": {
          publisher: "test-publisher",
        },
      };
      const featured = {
        discover: ["ext-1"],
      };
      const expectedRegistry = {
        "ext-1": {
          publisher: "test-publisher",
        },
      };
      nock(registryOrigin)
        .get("/extensions.json")
        .reply(200, { mods: registry, featured: featured });

      const filteredRegistry = await getExtensionRegistry(true);

      expect(filteredRegistry).to.deep.equal(expectedRegistry);
      expect(nock.isDone()).to.be.true;
    });

    it("should return an empty object if mods are not specified", async () => {
      nock(registryOrigin).get("/extensions.json").reply(200, {});

      const registry = await getExtensionRegistry();

      expect(registry).to.deep.equal({});
      expect(nock.isDone()).to.be.true;
    });

    it("should return an empty object if onlyFeatured is true and featured is not specified", async () => {
      const registry = {
        "ext-1": {
          publisher: "test-publisher",
        },
        "ext-2": {
          publisher: "test-publisher",
        },
      };
      nock(registryOrigin).get("/extensions.json").reply(200, { mods: registry });

      const filteredRegistry = await getExtensionRegistry(true);

      expect(filteredRegistry).to.deep.equal({});
      expect(nock.isDone()).to.be.true;
    });
  });
});
