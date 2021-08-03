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

  before(() => {
    helper = new containerCleaner.DockerHelper("us");
    listTags = sinon.stub(helper.client, "listTags").rejects("Unexpected call");
    deleteTag = sinon.stub(helper.client, "deleteTag").rejects("Unexpected call");
    deleteImage = sinon.stub(helper.client, "deleteImage").rejects("Unexpected call");
  });

  after(() => {
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
    listTags.withArgs("foo/bar").resolves(FOO_BAR);

    await expect(helper.ls("foo/bar")).to.eventually.deep.equal({
      digests: ["sha256:hash1", "sha256:hash2"],
      tags: ["tag1", "tag2"],
      children: ["baz"],
    });

    await expect(helper.ls("foo/bar")).to.eventually.deep.equal({
      digests: ["sha256:hash1", "sha256:hash2"],
      tags: ["tag1", "tag2"],
      children: ["baz"],
    });

    // This also verifies that we haven't called at "/foo" to ls "/foo/bar"
    expect(listTags).to.have.been.calledOnce;
  });

  it("Deletes recursively", async () => {
    listTags.withArgs("foo/bar").resolves(FOO_BAR);
    listTags.withArgs("foo/bar/baz").resolves(FOO_BAR_BAZ);

    const remainingTags: Record<string, string[]> = {
      "foo/bar": ["tag1", "tag2"],
      "foo/bar/baz": ["tag3"],
    };
    deleteTag.callsFake((path: string, tag: string) => {
      if (!remainingTags[path].includes(tag)) {
        throw new Error("Cannot remove tag twice");
      }
      remainingTags[path].splice(remainingTags[path].indexOf(tag), 1);
    });
    deleteImage.callsFake((path: string, digest: string) => {
      if (remainingTags[path].length) {
        throw new Error("Cannot remove image while tags still pin it");
      }
    });

    await helper.rm("foo/bar");

    expect(listTags).to.have.been.calledTwice;
    expect(listTags).to.have.been.calledWith("foo/bar");
    expect(listTags).to.have.been.calledWith("foo/bar/baz");

    expect(deleteTag).to.have.been.calledThrice;
    expect(deleteTag).to.have.been.calledWith("foo/bar/baz", "tag3");
    expect(deleteTag).to.have.been.calledWith("foo/bar", "tag1");
    expect(deleteTag).to.have.been.calledWith("foo/bar", "tag2");

    expect(deleteImage).to.have.been.calledThrice;
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
    runtime: "nodejs14",
    trigger: {
      allowInsecure: false,
    },
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

describe("listGCFArtifacts", () => {
  const UUIDS = Promise.resolve({
    children: ["uuid1", "uuid2", "uuid3"],
    digests: [],
    tags: [],
  });

  const UUIDS_1 = Promise.resolve({
    children: ["uuid4", "uuid5", "uuid6"],
    digests: [],
    tags: [],
  });

  const UUIDS_2 = Promise.resolve({
    children: ["uuid11", "uuid12"],
    digests: [],
    tags: [],
  });

  const LOCATIONS = Promise.resolve({
    children: ["us-central1", "us-west2"],
    digests: [],
    tags: [],
  });

  const LOCATIONS_EU = Promise.resolve({
    children: ["europe-west1", "europe-central2"],
    digests: [],
    tags: [],
  });

  const MIXED = Promise.resolve({
    children: ["uuid1", "us-central1"],
    digests: [],
    tags: [],
  });

  const MIXED_EU = Promise.resolve({
    children: ["uuid7", "europe-west1"],
    digests: [],
    tags: [],
  });

  const CHILD_TAGS = Promise.resolve({
    children: [],
    digests: [],
    tags: ["tag1", "tag2"],
  });

  const CHILD_EMPTY = Promise.resolve({
    children: [],
    digests: [],
    tags: [],
  });

  it("should throw an error on invalid location", () => {
    expect(() => containerCleaner.listGCFArtifacts("project", ["invalid"])).to.throw;
  });

  it("should list artifacts, single location param", async () => {
    const stubDH = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubDH.ls.withArgs("project/gcf/us-central1").returns(UUIDS);
    stubDH.ls.withArgs("project/gcf/us-central1/uuid1").returns(CHILD_TAGS);
    stubDH.ls.withArgs("project/gcf/us-central1/uuid2").returns(CHILD_TAGS);
    stubDH.ls.withArgs("project/gcf/us-central1/uuid3").returns(CHILD_EMPTY);
    const helpers: Record<string, containerCleaner.DockerHelper> = {};
    helpers["us"] = stubDH;

    const artifacts = await containerCleaner.listGCFArtifacts("project", ["us-central1"], helpers);

    expect(artifacts.size).to.eq(3);
    expect(artifacts).to.include("uuid1 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid2 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid3");
  });

  it("should list artifacts, multiple locations param", async () => {
    const stubDH = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubDH.ls.withArgs("project/gcf/us-central1").returns(UUIDS);
    stubDH.ls.withArgs("project/gcf/us-central1/uuid1").returns(CHILD_TAGS);
    stubDH.ls.withArgs("project/gcf/us-central1/uuid2").returns(CHILD_TAGS);
    stubDH.ls.withArgs("project/gcf/us-central1/uuid3").returns(CHILD_EMPTY);
    const stubEU = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEU.ls.withArgs("project/gcf/europe-central2").returns(UUIDS_1);
    stubEU.ls.withArgs("project/gcf/europe-central2/uuid4").returns(CHILD_TAGS);
    stubEU.ls.withArgs("project/gcf/europe-central2/uuid5").returns(CHILD_TAGS);
    stubEU.ls.withArgs("project/gcf/europe-central2/uuid6").returns(CHILD_EMPTY);
    const helpers: Record<string, containerCleaner.DockerHelper> = {};
    helpers["us"] = stubDH;
    helpers["eu"] = stubEU;

    const artifacts = await containerCleaner.listGCFArtifacts(
      "project",
      ["us-central1", "europe-central2"],
      helpers
    );

    expect(artifacts.size).to.eq(6);
    expect(artifacts).to.include("uuid1 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid2 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid3");
    expect(artifacts).to.include("uuid4 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid5 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid6");
  });

  it("should list all artifacts from location dirs", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf").returns(LOCATIONS);
    stubUS.ls.withArgs("project/gcf/us-central1").returns(UUIDS);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid1").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid2").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid3").returns(CHILD_EMPTY);
    stubUS.ls.withArgs("project/gcf/us-west2").returns(CHILD_EMPTY);
    const stubEmpty = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEmpty.ls.withArgs("project/gcf").returns(CHILD_EMPTY);
    const helpers: Record<string, containerCleaner.DockerHelper> = {};
    helpers["us"] = stubUS;
    helpers["eu"] = helpers["asia"] = stubEmpty;

    const artifacts = await containerCleaner.listGCFArtifacts("project", undefined, helpers);

    expect(artifacts.size).to.eq(3);
    expect(artifacts).to.include("uuid1 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid2 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid3");
  });

  it("should list artifacts from location dirs, multiple subdomains", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf").returns(LOCATIONS);
    stubUS.ls.withArgs("project/gcf/us-central1").returns(UUIDS);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid1").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid2").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid3").returns(CHILD_EMPTY);
    stubUS.ls.withArgs("project/gcf/us-west2").returns(CHILD_EMPTY);
    const stubEU = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEU.ls.withArgs("project/gcf").returns(LOCATIONS_EU);
    stubEU.ls.withArgs("project/gcf/europe-west1").returns(UUIDS_1);
    stubEU.ls.withArgs("project/gcf/europe-west1/uuid4").returns(CHILD_TAGS);
    stubEU.ls.withArgs("project/gcf/europe-west1/uuid5").returns(CHILD_TAGS);
    stubEU.ls.withArgs("project/gcf/europe-west1/uuid6").returns(CHILD_EMPTY);
    stubEU.ls.withArgs("project/gcf/europe-central2").returns(CHILD_EMPTY);
    const stubEmpty = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEmpty.ls.withArgs("project/gcf").returns(CHILD_EMPTY);
    const helpers: Record<string, containerCleaner.DockerHelper> = {};
    helpers["us"] = stubUS;
    helpers["eu"] = stubEU;
    helpers["asia"] = stubEmpty;

    const artifacts = await containerCleaner.listGCFArtifacts("project", undefined, helpers);

    expect(artifacts.size).to.eq(6);
    expect(artifacts).to.include("uuid1 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid2 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid3");
    expect(artifacts).to.include("uuid4 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid5 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid6");
  });

  it("should list artifacts no location dirs", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf").returns(UUIDS);
    stubUS.ls.withArgs("project/gcf/uuid1").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/uuid2").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/uuid3").returns(CHILD_EMPTY);
    const stubEmpty = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEmpty.ls.withArgs("project/gcf").returns(CHILD_EMPTY);
    const helpers: Record<string, containerCleaner.DockerHelper> = {};
    helpers["us"] = stubUS;
    helpers["eu"] = helpers["asia"] = stubEmpty;

    const artifacts = await containerCleaner.listGCFArtifacts("project", undefined, helpers);

    expect(artifacts.size).to.eq(3);
    expect(artifacts).to.include("uuid1 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid2 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid3");
  });

  it("should list artifacts no location dirs, multiple subdomains", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf").returns(UUIDS);
    stubUS.ls.withArgs("project/gcf/uuid1").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/uuid2").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/uuid3").returns(CHILD_EMPTY);
    const stubEU = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEU.ls.withArgs("project/gcf").returns(UUIDS_1);
    stubEU.ls.withArgs("project/gcf/uuid4").returns(CHILD_TAGS);
    stubEU.ls.withArgs("project/gcf/uuid5").returns(CHILD_TAGS);
    stubEU.ls.withArgs("project/gcf/uuid6").returns(CHILD_EMPTY);
    const stubEmpty = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEmpty.ls.withArgs("project/gcf").returns(CHILD_EMPTY);
    const helpers: Record<string, containerCleaner.DockerHelper> = {};
    helpers["us"] = stubUS;
    helpers["eu"] = stubEU;
    helpers["asia"] = stubEmpty;

    const artifacts = await containerCleaner.listGCFArtifacts("project", undefined, helpers);

    expect(artifacts.size).to.eq(6);
    expect(artifacts).to.include("uuid1 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid2 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid3");
    expect(artifacts).to.include("uuid4 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid5 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid6");
  });

  it("should list all artifacts mixed location dirs", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf").returns(MIXED);
    stubUS.ls.withArgs("project/gcf/uuid1").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/us-central1").returns(UUIDS_1);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid4").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid5").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid6").returns(CHILD_EMPTY);
    const stubEmpty = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEmpty.ls.withArgs("project/gcf").returns(CHILD_EMPTY);
    const helpers: Record<string, containerCleaner.DockerHelper> = {};
    helpers["us"] = stubUS;
    helpers["eu"] = helpers["asia"] = stubEmpty;

    const artifacts = await containerCleaner.listGCFArtifacts("project", undefined, helpers);

    expect(artifacts.size).to.eq(4);
    expect(artifacts).to.include("uuid1 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid4 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid5 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid6");
  });

  it("should list all artifacts mixed location dirs, multiple subdomains", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf").returns(MIXED);
    stubUS.ls.withArgs("project/gcf/uuid1").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/us-central1").returns(UUIDS_1);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid4").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid5").returns(CHILD_TAGS);
    stubUS.ls.withArgs("project/gcf/us-central1/uuid6").returns(CHILD_EMPTY);
    const stubEU = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEU.ls.withArgs("project/gcf").returns(MIXED_EU);
    stubEU.ls.withArgs("project/gcf/uuid7").returns(CHILD_TAGS);
    stubEU.ls.withArgs("project/gcf/europe-west1").returns(UUIDS_2);
    stubEU.ls.withArgs("project/gcf/europe-west1/uuid11").returns(CHILD_TAGS);
    stubEU.ls.withArgs("project/gcf/europe-west1/uuid12").returns(CHILD_EMPTY);
    const stubEmpty = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEmpty.ls.withArgs("project/gcf").returns(CHILD_EMPTY);
    const helpers: Record<string, containerCleaner.DockerHelper> = {};
    helpers["us"] = stubUS;
    helpers["eu"] = stubEU;
    helpers["asia"] = stubEmpty;

    const artifacts = await containerCleaner.listGCFArtifacts("project", undefined, helpers);

    expect(artifacts.size).to.eq(7);
    expect(artifacts).to.include("uuid1 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid4 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid5 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid6");
    expect(artifacts).to.include("uuid7 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid11 - tags:tag1,tag2");
    expect(artifacts).to.include("uuid12");
  });
});

describe("deleteGCFArtifacts", () => {
  it("should throw an error on invalid location", () => {
    expect(() => containerCleaner.deleteGCFArtifacts("project", ["invalid"])).to.throw;
  });

  it("should purge a specific location", async () => {
    const stubDH = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubDH.ls.withArgs("project/gcf/us-central1").returns(
      Promise.resolve({
        children: ["uuid"],
        digests: [],
        tags: [],
      })
    );
    const helpers: Record<string, containerCleaner.DockerHelper> = {};
    helpers["us"] = stubDH;
    helpers["eu"] = stubDH;
    helpers["asia"] = stubDH;

    await containerCleaner.deleteGCFArtifacts("project", ["us-central1"], helpers);

    expect(stubDH.rm).to.have.been.calledOnceWith("project/gcf/us-central1");
  });

  it("should purge a multiple specific locations", async () => {
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf/us-central1").returns(
      Promise.resolve({
        children: ["uuid"],
        digests: [],
        tags: [],
      })
    );
    stubUS.ls.withArgs("project/gcf/us-west2").returns(
      Promise.resolve({
        children: ["uuid1"],
        digests: [],
        tags: [],
      })
    );
    const stubEU = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubEU.ls.withArgs("project/gcf/europe-west1").returns(
      Promise.resolve({
        children: ["uuid2"],
        digests: [],
        tags: [],
      })
    );
    const helpers: Record<string, containerCleaner.DockerHelper> = {};
    helpers["us"] = stubUS;
    helpers["eu"] = stubEU;

    await containerCleaner.deleteGCFArtifacts(
      "project",
      ["us-central1", "us-west2", "europe-west1"],
      helpers
    );

    expect(stubUS.rm).to.have.been.calledTwice;
    expect(stubUS.rm).to.have.been.calledWith("project/gcf/us-central1");
    expect(stubUS.rm).to.have.been.calledWith("project/gcf/us-central1");
    expect(stubEU.rm).to.have.been.calledOnceWith("project/gcf/europe-west1");
  });

  it("should purge all subdomains", async () => {
    const gcfObject = Promise.resolve({
      children: ["uuid", "uuid1", "uuid2"],
      digests: [],
      tags: [],
    });
    const stubUS = sinon.createStubInstance(containerCleaner.DockerHelper);
    const stubEU = sinon.createStubInstance(containerCleaner.DockerHelper);
    const stubDHAsia = sinon.createStubInstance(containerCleaner.DockerHelper);
    stubUS.ls.withArgs("project/gcf").returns(gcfObject);
    stubEU.ls.withArgs("project/gcf").returns(gcfObject);
    stubDHAsia.ls.withArgs("project/gcf").returns(gcfObject);

    const helpers: Record<string, containerCleaner.DockerHelper> = {
      us: stubUS,
      eu: stubEU,
      asia: stubDHAsia,
    };

    await containerCleaner.deleteGCFArtifacts("project", undefined, helpers);

    // we rm the gcf directory in every subdomain
    expect(stubUS.rm).to.have.been.calledOnceWith("project/gcf");
    expect(stubEU.rm).to.have.been.calledOnceWith("project/gcf");
    expect(stubDHAsia.rm).to.have.been.calledOnceWith("project/gcf");
  });
});
