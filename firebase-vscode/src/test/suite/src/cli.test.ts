import * as assert from "assert";
import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";

firebaseSuite("empty test", () => {
  firebaseTest(
    "empty test",
    async () => {
      assert.deepStrictEqual([], []);
    }
  );
});
