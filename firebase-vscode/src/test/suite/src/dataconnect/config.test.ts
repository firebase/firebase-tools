import assert from "assert";
import { createTestBroker } from "../../../utils/broker";
import { firebaseSuite } from "../../../utils/test_hooks";
import { setupMockTestWorkspaces } from "../../../utils/workspace";
import {
  dataConnectConfigs,
  registerDataConnectConfigs,
} from "../../../../data-connect/config";
import { createTemporaryDirectory } from "../../../utils/fs";
import { createFake, createFakeContext, mock } from "../../../utils/mock";
import { workspace } from "../../../../utils/test_hooks";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

firebaseSuite("registerDataConnectConfigs", async () => {
  firebaseSuite("handles getInitialData requests", async () => {
    const broker = createTestBroker();
    setupMockTestWorkspaces({
      firebaseRc: { projects: { default: "my-project" } },
      firebaseConfig: { emulators: { dataconnect: { port: 9399 } } },
    });

    const context = createFakeContext();
    registerDataConnectConfigs(context, broker);

    broker.simulateOn("getInitialData");

    assert.deepEqual(broker.sentLogs, [
      {
        message: "notifyFirebaseConfig",
        args: [
          {
            firebaseJson: {
              emulators: {
                dataconnect: {
                  port: 9399,
                },
              },
            },
            firebaseRC: {
              etags: {},
              projects: {
                default: "my-project",
              },
              targets: {},
            },
          },
        ],
      },
    ]);
  });

  firebaseSuite(
    "listens to create/update/delete events on firebase.json/.firebaserc/firemat.yaml",
    async () => {
      const watcherListeners: Record<
        string,
        {
          create?: (uri: vscode.Uri) => void;
          update?: (uri: vscode.Uri) => void;
          delete?: (uri: vscode.Uri) => void;
        }
      > = {};

      function addFSListener(
        pattern: string,
        type: "create" | "update" | "delete",
        cb: (uri: vscode.Uri) => void,
      ) {
        const listeners = (watcherListeners[pattern] ??= {});
        assert.equal(watcherListeners[pattern]?.create, undefined);
        listeners[type] = cb;
        return { dispose: () => {} };
      }

      const dir = createTemporaryDirectory();
      mock(
        workspace,
        createFake({
          workspaceFolders: [
            createFake<vscode.WorkspaceFolder>({ uri: vscode.Uri.file(dir) }),
          ],
          // Override "createFileSystemWatcher" to spy on the watchers.
          createFileSystemWatcher: (pattern: any) => {
            const file = (pattern as vscode.RelativePattern).pattern;
            return createFake<vscode.FileSystemWatcher>({
              onDidCreate: (cb) => addFSListener(file, "create", cb),
              onDidChange: (cb) => addFSListener(file, "update", cb),
              onDidDelete: (cb) => addFSListener(file, "delete", cb),
              dispose: () => {},
            });
          },
        }),
      );

      const context = createFakeContext();
      const broker = createTestBroker();
      registerDataConnectConfigs(context, broker);

      const dataConnectListeners =
        watcherListeners["**/{dataconnect,connector}.yaml"]!;
      const dataConnectFile = path.join(dir, "**/{dataconnect,connector}.yaml");

      function testDataConnectEvent(event: "create" | "update" | "delete") {
        fs.writeFileSync(dataConnectFile, `specVersion: ${event}`);
        dataConnectListeners[event]!(vscode.Uri.file(dataConnectFile));

        assert.deepEqual(dataConnectConfigs.value, [{}]);
      }

      testDataConnectEvent("create");
      testDataConnectEvent("update");
    },
  );
});
