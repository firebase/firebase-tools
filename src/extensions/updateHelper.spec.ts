import { expect } from "chai";

import * as updateHelper from "./updateHelper";

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
