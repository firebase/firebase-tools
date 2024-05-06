import * as assert from "assert";
import { getChannels } from "../../../cli";
import { Config } from "../../../config";
import { firebaseSuite, firebaseTest } from "../../utils/test_hooks";

firebaseSuite("getChannels", () => {
  firebaseTest(
    "returns an empty array if no firebaseJSON provided",
    async () => {
      const result = await getChannels(null);
      assert.deepStrictEqual(result, []);
    }
  );

  firebaseTest("returns an empty array if no project provided", async () => {
    const result = await getChannels({} as Config);
    assert.deepStrictEqual(result, []);
  });
});
