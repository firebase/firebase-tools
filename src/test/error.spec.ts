import { expect } from "chai";
import { FirebaseError } from "../error";

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
      const allOptions: Required<ConstructorParameters<typeof FirebaseError>[1]> = {
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
});
