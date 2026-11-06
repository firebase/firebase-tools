import { expect } from "chai";
import { FirebaseError, getErrMsg, getErrStack } from "./error";

describe("error", () => {
  describe("FirebaseError", () => {
    it("should be an instance of Error", () => {
      const error = new FirebaseError("test-message");

      expect(error).to.be.instanceOf(Error);
    });

    it("should apply default options", () => {
      const error = new FirebaseError("test-message");

      expect(error).to.deep.include({ children: [], exit: 1, name: "FirebaseError", status: 500 });
    });

    it("should persist all options", () => {
      /**
       * All possible options that might be provided to `FirebaseError`.
       */
      type FirebaseErrorOptions = ConstructorParameters<typeof FirebaseError>[1];

      /*
       * The following `Required` ensures all options are defined, so the test
       * covers all properties.
       */
      const allOptions: Required<FirebaseErrorOptions> = {
        children: ["test-child-1", "test-child-2"],
        context: "test-context",
        exit: 123,
        original: new Error("test-original-error-message"),
        status: 456,
      };

      const error = new FirebaseError("test-message", allOptions);

      expect(error).to.deep.include(allOptions);
    });
  });

  describe("getErrMsg", () => {
    it("does not throw on a circular non-Error value", () => {
      const circular: Record<string, unknown> = { msg: "real message" };
      circular.self = circular;

      expect(getErrMsg(circular)).to.contain("real message");
      expect(getErrStack(circular)).to.contain("real message");
    });
  });
});
