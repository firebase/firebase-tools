import * as assert from "assert";
import { getChannels } from "../../cli";
import { Config } from "../../config";
import { firematSuite, firematTest } from "../utils/test_hooks";

firematSuite("getChannels", () => {
  firematTest(
    "returns an empty array if no firebaseJSON provided",
    async () => {
      const result = await getChannels(null);
      assert.deepStrictEqual(result, []);
    },
  );

  firematTest("returns an empty array if no project provided", async () => {
    const result = await getChannels({} as Config);
    assert.deepStrictEqual(result, []);
  });
});
