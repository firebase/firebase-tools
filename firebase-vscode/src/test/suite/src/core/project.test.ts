import assert from "assert";
import { _promptUserForProject } from "../../../../core/project";
import { firebaseSuite, firebaseTest } from "../../../utils/test_hooks";
import * as vscode from "vscode";

firebaseSuite("_promptUserForProject", () => {
  firebaseTest("supports not selecting a project", async () => {
    const tokenSource = new vscode.CancellationTokenSource();

    const result = _promptUserForProject(
      new Promise((resolve) => resolve([])),
      tokenSource.token
    );

    // Cancel the prompt
    tokenSource.cancel();

    assert.equal(await result, undefined);
  });
});
