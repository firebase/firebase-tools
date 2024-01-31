import assert from "assert";
import { getRootFolders } from "../../config-files";
import { _promptUserForProject } from "../../core/project";
import { workspace } from "../../utils/test_hooks";
import { mock } from "../utils/mock";
import { firematSuite, firematTest } from "../utils/test_hooks";
import * as vscode from "vscode";

firematSuite("_promptUserForProject", () => {
  firematTest("supports not selecting a project", async () => {
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
