import * as assert from "assert";
import { getChannels } from "../../cli";
import { Config } from "../../config";
import { dataConnectSuite, dataConnectTest } from "../utils/test_hooks";

dataConnectSuite("getChannels", () => {
  dataConnectTest(
    "returns an empty array if no firebaseJSON provided",
    async () => {
      const result = await getChannels(null);
      assert.deepStrictEqual(result, []);
    },
  );

  dataConnectTest("returns an empty array if no project provided", async () => {
    const result = await getChannels({} as Config);
    assert.deepStrictEqual(result, []);
  });
});
