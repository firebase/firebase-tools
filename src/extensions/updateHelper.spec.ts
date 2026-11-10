import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../error";
import * as extensionsApi from "./extensionsApi";
import * as updateHelper from "./updateHelper";

describe("update", () => {
  let updateInstanceFromRegistryStub: sinon.SinonStub;

  beforeEach(() => {
    updateInstanceFromRegistryStub = sinon
      .stub(extensionsApi, "updateInstanceFromRegistry")
      .resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should update instance from registry when extRef is provided", async () => {
    await updateHelper.update({
      projectId: "test-project",
      instanceId: "test-instance",
      extRef: "firebase/storage-resize-images@0.1.2",
      canEmitEvents: false,
    });

    expect(updateInstanceFromRegistryStub).to.have.been.calledOnceWith({
      projectId: "test-project",
      instanceId: "test-instance",
      extRef: "firebase/storage-resize-images@0.1.2",
      params: undefined,
      systemParams: undefined,
      canEmitEvents: false,
      allowedEventTypes: undefined,
      eventarcChannel: undefined,
    });
  });

  it("should throw an error if extRef is not supplied", async () => {
    await expect(
      updateHelper.update({
        projectId: "test-project",
        instanceId: "test-instance",
        canEmitEvents: false,
      }),
    ).to.be.rejectedWith(
      FirebaseError,
      "A version of the extension was not supplied for test-instance",
    );
  });
});

describe("inferUpdateSource", () => {
  it("should infer update source from ref without version", () => {
    const result = updateHelper.inferUpdateSource("", "firebase/storage-resize-images");
    expect(result).to.equal("firebase/storage-resize-images@latest");
  });

  it("should infer update source from ref with just version", () => {
    const result = updateHelper.inferUpdateSource("0.1.2", "firebase/storage-resize-images");
    expect(result).to.equal("firebase/storage-resize-images@0.1.2");
  });

  it("should infer update source from ref and extension name", () => {
    const result = updateHelper.inferUpdateSource(
      "storage-resize-images",
      "firebase/storage-resize-images",
    );
    expect(result).to.equal("firebase/storage-resize-images@latest");
  });

  it("should infer update source if it is a ref distinct from the input ref", () => {
    const result = updateHelper.inferUpdateSource(
      "notfirebase/storage-resize-images",
      "firebase/storage-resize-images",
    );
    expect(result).to.equal("notfirebase/storage-resize-images@latest");
  });
});
