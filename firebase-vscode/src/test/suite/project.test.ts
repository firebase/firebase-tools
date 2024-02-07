import assert from "assert";
import { _promptUserForProject } from "../../core/project";
import { firematSuite, firematTest } from "../utils/test_hooks";
import * as vscode from "vscode";

firematSuite("_promptUserForProject", () => {
  firematTest("supports not selecting a project", async () => {
    const tokenSource = new vscode.CancellationTokenSource();

    const result = _promptUserForProject([], tokenSource.token);

    // Cancel the prompt
    tokenSource.cancel();

    assert.equal(await result, undefined);
  });
});
