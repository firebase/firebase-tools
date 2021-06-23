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
    apiVersion: 1,
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
