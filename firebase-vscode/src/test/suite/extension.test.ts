import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { getChannels } from "../../cli";
import { Config } from "../../config";

/**
 * Sample unit test using extension code
 */

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("getChannels() returns an empty array if no firebaseJSON provided", async () => {
    const result = await getChannels(null);
    assert.deepStrictEqual(result, []);
  });

  test("getChannels() returns an empty array if no project provided", async () => {
    const result = await getChannels({} as Config);
    assert.deepStrictEqual(result, []);
  });
});
