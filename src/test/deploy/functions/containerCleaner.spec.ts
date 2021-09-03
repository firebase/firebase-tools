import { expect } from "chai";
import _ from "lodash";
import * as sinon from "sinon";

import * as backend from "../../../deploy/functions/backend";
import * as containerCleaner from "../../../deploy/functions/containerCleaner";
import * as docker from "../../../gcp/docker";

describe("DockerHelper", () => {
  let listTags: sinon.SinonStub;
  let deleteTag: sinon.SinonStub;
  let deleteImage: sinon.SinonStub;
  let helper: containerCleaner.DockerHelper;

  beforeEach(() => {
    helper = new containerCleaner.DockerHelper("us");
    listTags = sinon.stub(helper.client, "listTags").rejects("Unexpected call");
    deleteTag = sinon.stub(helper.client, "deleteTag").rejects("Unexpected call");
    deleteImage = sinon.stub(helper.client, "deleteImage").rejects("Unexpected call");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  const FOO_BAR: docker.Tags = {
    name: "foo/bar",
    tags: ["tag1", "tag2"],
    manifest: {
      "sha256:hash1": {} as any,
      "sha256:hash2": {} as any,
    },
    child: ["baz"],
  };

  const FOO_BAR_BAZ: docker.Tags = {
    name: "foo/bar/baz",
    tags: ["tag3"],
    manifest: {
      "sha256:hash3": {} as any,
    },
    child: [],
  };

  it("Fetches tags with caching", async () => {
    listTags
      .withArgs("foo/bar")
      .onFirstCall()
      .rejects("I'm flaky!")
      .onSecondCall()
      .resolves(FOO_BAR);

    await expect(helper.ls("foo/bar")).to.eventually.deep.equal({
      digests: ["sha256:hash1", "sha256:hash2"],
      tags: ["tag1", "tag2"],
      children: ["baz"],
    });
    expect(listTags).to.have.been.calledTwice;
    expect(listTags).to.not.have.been.calledWith("foo");

    await expect(helper.ls("foo/bar")).to.eventually.deep.equal({
      digests: ["sha256:hash1", "sha256:hash2"],
      tags: ["tag1", "tag2"],
      children: ["baz"],
    });
    expect(listTags).to.have.been.calledTwice;
  });

  it("Deletes recursively", async () => {
    listTags.withArgs("foo/bar").resolves(FOO_BAR);
    listTags.withArgs("foo/bar/baz").resolves(FOO_BAR_BAZ);

    const remainingTags: Record<string, string[]> = {
      "foo/bar": ["tag1", "tag2"],
      "foo/bar/baz": ["tag3"],
    };
    let firstDeleteTag = true;
    deleteTag.callsFake((path: string, tag: string) => {
      if (firstDeleteTag) {
        firstDeleteTag = false;
        throw new Error("I'm flaky");
      }
      if (!remainingTags[path].includes(tag)) {
        throw new Error("Cannot remove tag twice");
      }
      remainingTags[path].splice(remainingTags[path].indexOf(tag), 1);
    });

    let firstDeleteImage = true;
    deleteImage.callsFake((path: string, digest: string) => {
      if (firstDeleteImage) {
        firstDeleteImage = false;
        throw new Error("I'm flaky");
      }
      if (remainingTags[path].length) {
        throw new Error("Cannot remove image while tags still pin it");
      }
    });

    await helper.rm("foo/bar");

    expect(listTags).to.have.been.calledTwice;
    expect(listTags).to.have.been.calledWith("foo/bar");
    expect(listTags).to.have.been.calledWith("foo/bar/baz");

    expect(deleteTag).to.have.been.callCount(4);
    expect(deleteTag).to.have.been.calledWith("foo/bar/baz", "tag3");
    expect(deleteTag).to.have.been.calledWith("foo/bar", "tag1");
    expect(deleteTag).to.have.been.calledWith("foo/bar", "tag2");

    expect(deleteImage).to.have.been.callCount(4);
    expect(deleteImage).to.have.been.calledWith("foo/bar/baz", "sha256:hash3");
    expect(deleteImage).to.have.been.calledWith("foo/bar", "sha256:hash1");
    expect(deleteImage).to.have.been.calledWith("foo/bar", "sha256:hash2");

    await expect(helper.ls("foo/bar")).to.eventually.deep.equal({
      digests: [],
      tags: [],
      children: [],
    });
    await expect(helper.ls("foo/bar/baz")).to.eventually.deep.equal({
      digests: [],
      tags: [],
      children: [],
    });
  });
});

describe("ContainerRegistryCleaner", () => {
  const FUNCTION: backend.FunctionSpec = {
    platform: "gcfv1",
    project: "project",
    region: "us-central1",
    id: "id",
    entryPoint: "function",
    runtime: "nodejs16",
    trigger: {},
  };

  // The first function in a region has subdirectories "cache/" and "worker/" in it.
  it("Handles cleanup of first function in the region", async () => {
    const cleaner = new containerCleaner.ContainerRegistryCleaner();

    // Any cast because the stub apparently isn't stubbing getNode as a private member.
    // This shouldn't blow up because the public methods are stubbed anyway.
    const stub = sinon.createStubInstance(containerCleaner.DockerHelper);
    cleaner.helpers["us"] = stub as any;

    stub.ls.withArgs("project/gcf/us-central1").returns(
      Promise.resolve({
        children: ["uuid"],
        digests: [],
        tags: [],
      })
    );
    stub.ls.withArgs("project/gcf/us-central1/uuid").returns(
      Promise.resolve({
        children: ["cache", "worker"],
        digests: ["sha256:func-hash"],
        tags: ["id_version-1"],
      })
    );

    await cleaner.cleanupFunction(FUNCTION);

    expect(stub.rm).to.have.been.calledOnceWith("project/gcf/us-central1/uuid");
  });

  // The second function of the region doesn't have subdirectories
  it("Handles cleanup of second function in the region", async () => {
    const cleaner = new containerCleaner.ContainerRegistryCleaner();

    // Any cast because the stub apparently isn't stubbing getNode as a priavte member.
    // This shouldn't blow up because the public methods are stubbed anyway.
    const stub = sinon.createStubInstance(containerCleaner.DockerHelper);
    cleaner.helpers["us"] = stub as any;

    stub.ls.withArgs("project/gcf/us-central1").returns(
      Promise.resolve({
        children: ["uuid"],
        digests: [],
        tags: [],
      })
    );
    stub.ls.withArgs("project/gcf/us-central1/uuid").returns(
      Promise.resolve({
        children: [],
        digests: ["sha256:func-hash"],
        tags: ["id_version-1"],
      })
    );

    await cleaner.cleanupFunction(FUNCTION);

    expect(stub.rm).to.have.been.calledOnceWith("project/gcf/us-central1/uuid");
  });

  it("Leaves other directories alone", async () => {
    const cleaner = new containerCleaner.ContainerRegistryCleaner();

    // Any cast because the stub apparently isn't stubbing getNode as a priavte member.
    // This shouldn't blow up because the public methods are stubbed anyway.
    const stub = sinon.createStubInstance(containerCleaner.DockerHelper);
    cleaner.helpers["us"] = stub as any;

    stub.ls.withArgs("project/gcf/us-central1").returns(
      Promise.resolve({
        children: ["uuid"],
        digests: [],
        tags: [],
      })
    );
    stub.ls.withArgs("project/gcf/us-central1/uuid").returns(
      Promise.resolve({
        children: [],
        digests: ["sha256:func-hash"],
        tags: ["other-function_version-1"],
      })
    );

    await cleaner.cleanupFunction(FUNCTION);

    expect(stub.rm).to.not.have.been.called;
  });
});

describe("listGcfPaths", () => {
  const LOCATIONS_US = Promise.resolve({
    children: ["us-central1", "us-west2"],
    digests: [],
    tags: [],
  });

  const LOCATIONS_EU = Promise.resolve({
    children: ["europe-west1", "europe-central2"],
    digests: [],
    tags: [],
  });

  const LOCATIONS_ASIA = Promise.resolve({
    children: ["asia-northeast1", "asia-south1"],
    digests: [],
    tags: [],
  });

  const EMPTY = Promise.resolve({
    children: [],
    digests: [],
    tags: [],
  });

  it("should throw an error on invalid location", async () => {
    await expect(containerCleaner.listGcfPaths("project", ["invalid"])).to.be.rejected;
  });

  it("should throw an error when subdomains fail search", async () => {
    const stub = sinon.createStubInstance(containerCleaner.DockerHelper);
    stub.rm.throws(new Error("DockerHelper rm stub error"));
    const helpers = {
      us: stub,
      eu: stub,
      asia: stub,
    };

    await expect(containerCleaner.listGcfPaths("project", undefined, helpers)).to.be.rejected;
  });

  it("should list paths, single location param", async () => {
    const stub = sinon.createStubInstance(containerCleaner.DockerHelper);
    stub.ls.withArgs("project/gcf").returns(LOCATIONS_US);
    const stubEmpty = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEmpty.ls.withArgs("project/gcf").returns(EMPTY);
    const helpers = { us: stub, eu: stubEmpty, asia: stubEmpty };

    const paths = await containerCleaner.listGcfPaths("project", ["us-central1"], helpers);

    expect(paths).to.deep.equal(["us.gcr.io/project/gcf/us-central1"]);
  });

  it("should list paths, multiple locations param", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf").returns(LOCATIONS_US);
    const stubEU = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEU.ls.withArgs("project/gcf").returns(LOCATIONS_EU);
    const stubEmpty = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEmpty.ls.withArgs("project/gcf").returns(EMPTY);
    const helpers = { us: stubUS, eu: stubEU, asia: stubEmpty };

    const paths = await containerCleaner.listGcfPaths(
      "project",
      ["us-central1", "europe-west1"],
      helpers
    );
    paths.sort();

    expect(paths).to.deep.equal([
      "eu.gcr.io/project/gcf/europe-west1",
      "us.gcr.io/project/gcf/us-central1",
    ]);
  });

  it("should list paths, only locations in gcr", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf").returns(LOCATIONS_US);
    const stubEmpty = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEmpty.ls.withArgs("project/gcf").returns(EMPTY);
    const helpers = { us: stubUS, eu: stubEmpty, asia: stubEmpty };

    const paths = await containerCleaner.listGcfPaths(
      "project",
      ["us-central1", "us-west4"],
      helpers
    );

    expect(paths).to.deep.equal(["us.gcr.io/project/gcf/us-central1"]);
  });

  it("should list paths, all locations", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf").returns(LOCATIONS_US);
    const stubEU = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEU.ls.withArgs("project/gcf").returns(LOCATIONS_EU);
    const stubAsia = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubAsia.ls.withArgs("project/gcf").returns(LOCATIONS_ASIA);
    const helpers = { us: stubUS, eu: stubEU, asia: stubAsia };

    const paths = await containerCleaner.listGcfPaths("project", undefined, helpers);
    paths.sort();

    expect(paths).to.deep.equal([
      "asia.gcr.io/project/gcf/asia-northeast1",
      "asia.gcr.io/project/gcf/asia-south1",
      "eu.gcr.io/project/gcf/europe-central2",
      "eu.gcr.io/project/gcf/europe-west1",
      "us.gcr.io/project/gcf/us-central1",
      "us.gcr.io/project/gcf/us-west2",
    ]);
  });
});

describe("deleteGcfArtifacts", () => {
  const DIRECTORY = Promise.resolve({
    children: ["dir"],
    digests: ["image1", "image2"],
    tags: ["tag"],
  });

  it("should throw an error on invalid location", async () => {
    await expect(containerCleaner.deleteGcfArtifacts("project", ["invalid"])).to.be.rejected;
  });

  it("should throw an error when subdomains fail deletion", async () => {
    const stub = sinon.createStubInstance(containerCleaner.DockerHelper);
    stub.rm.throws(new Error("DockerHelper rm stub error"));
    const helpers = {
      us: stub,
      eu: stub,
      asia: stub,
    };

    await expect(containerCleaner.deleteGcfArtifacts("project", undefined, helpers)).to.be.rejected;
  });

  it("should delete a location", async () => {
    const stub = sinon.createStubInstance(containerCleaner.DockerHelper);
    stub.ls.withArgs("project/gcf/us-central1").returns(DIRECTORY);
    const helpers: Record<string, containerCleaner.DockerHelper> = { us: stub };

    await containerCleaner.deleteGcfArtifacts("project", ["us-central1"], helpers);

    expect(stub.rm).to.have.been.calledOnceWith("project/gcf/us-central1");
  });

  it("should delete multiple locations", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf/us-central1").returns(DIRECTORY);
    stubUS.ls.withArgs("project/gcf/us-west2").returns(DIRECTORY);
    const stubEU = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEU.ls.withArgs("project/gcf/europe-west1").returns(DIRECTORY);
    const helpers: Record<string, containerCleaner.DockerHelper> = { us: stubUS, eu: stubEU };

    await containerCleaner.deleteGcfArtifacts(
      "project",
      ["us-central1", "us-west2", "europe-west1"],
      helpers
    );

    expect(stubUS.rm).to.have.been.calledTwice;
    expect(stubUS.rm).to.have.been.calledWith("project/gcf/us-central1");
    expect(stubUS.rm).to.have.been.calledWith("project/gcf/us-west2");
    expect(stubEU.rm).to.have.been.calledOnceWith("project/gcf/europe-west1");
  });

  it("should purge all locations", async () => {
    const locations = Object.keys(containerCleaner.SUBDOMAIN_MAPPING);
    const usLocations = locations.filter((loc) => containerCleaner.SUBDOMAIN_MAPPING[loc] === "us");
    const euLocations = locations.filter((loc) => containerCleaner.SUBDOMAIN_MAPPING[loc] === "eu");
    const asiaLocations = locations.filter((loc) => {
      return containerCleaner.SUBDOMAIN_MAPPING[loc] === "asia";
    });
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    for (const usLoc of usLocations) {
      stubUS.ls.withArgs(`project/gcf/${usLoc}`).returns(DIRECTORY);
    }
    const stubEU = sinon.createStubInstance(containerCleaner.DockerHelper);
    for (const euLoc of euLocations) {
      stubEU.ls.withArgs(`project/gcf/${euLoc}`).returns(DIRECTORY);
    }
    const stubAsia = sinon.createStubInstance(containerCleaner.DockerHelper);
    for (const asiaLoc of asiaLocations) {
      stubAsia.ls.withArgs(`project/gcf/${asiaLoc}`).returns(DIRECTORY);
    }
    const helpers: Record<string, containerCleaner.DockerHelper> = {
      us: stubUS,
      eu: stubEU,
      asia: stubAsia,
    };

    await containerCleaner.deleteGcfArtifacts("project", undefined, helpers);

    expect(stubUS.rm).to.have.callCount(usLocations.length);
    for (const usLoc of usLocations) {
      expect(stubUS.rm).to.have.been.calledWith(`project/gcf/${usLoc}`);
    }
    expect(stubEU.rm).to.have.callCount(euLocations.length);
    for (const euLoc of euLocations) {
      expect(stubEU.rm).to.have.been.calledWith(`project/gcf/${euLoc}`);
    }
    expect(stubAsia.rm).to.have.callCount(asiaLocations.length);
    for (const asiaLoc of asiaLocations) {
      expect(stubAsia.rm).to.have.been.calledWith(`project/gcf/${asiaLoc}`);
    }
  });
});
