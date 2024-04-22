import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  _createWatcher,
  getConfigPath,
  _readFirebaseConfig,
  _readRC,
  firebaseConfig,
  firebaseRC,
  getRootFolders,
  registerConfig,
  dataConnectConfigs,
} from "../../../../core/config";
import {
  addDisposable,
  addTearDown,
  firebaseSuite,
  firebaseTest,
} from "../../../utils/test_hooks";
import { createFake, mock } from "../../../utils/mock";
import { resetGlobals } from "../../../../utils/globals";
import { workspace } from "../../../../utils/test_hooks";
import { createFile, createTemporaryDirectory } from "../../../utils/fs";
import { VsCodeOptions, currentOptions } from "../../../../options";
import { spyLogs } from "../../../utils/logs";
import { createTestBroker } from "../../../utils/broker";
import { setupMockTestWorkspaces } from "../../../utils/workspace";
import { RC } from "../../../../rc";
import { Config } from "../../../../config";
import { ResultValue } from "../../../../result";

firebaseSuite("getRootFolders", () => {
  firebaseTest("if workspace is empty, returns an empty array", () => {
    mock(workspace, undefined);

    const result = getRootFolders();

    assert.deepEqual(result, []);
  });

  firebaseTest(
    "if workspace.workspaceFolders is undefined, returns an empty array",
    () => {
      mock(workspace, {
        workspaceFolders: undefined,
      });

      const result = getRootFolders();

      assert.deepEqual(result, []);
    }
  );

  firebaseTest("returns an array of paths", () => {
    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file("/path/to/folder"),
        }),
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file("/path/to/another/folder"),
        }),
      ],
    });

    const result = getRootFolders();

    assert.deepEqual(result, ["/path/to/folder", "/path/to/another/folder"]);
  });

  firebaseTest("includes workspaceFile's directory if set", () => {
    mock(workspace, {
      workspaceFile: vscode.Uri.file("/path/to/folder/file"),
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file("/path/to/another/folder"),
        }),
      ],
    });

    const result = getRootFolders();

    assert.deepEqual(result, ["/path/to/another/folder", "/path/to/folder"]);
  });

  firebaseTest("filters path duplicates", () => {
    mock(workspace, {
      workspaceFile: vscode.Uri.file("/a/file"),
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file("/a"),
        }),
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file("/b"),
        }),
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file("/b"),
        }),
      ],
    });

    const result = getRootFolders();

    assert.deepEqual(result, ["/a", "/b"]);
  });
});

firebaseSuite("getConfigPath", () => {
  // Those tests will impact global variables. We need to reset them after each test.
  teardown(() => resetGlobals());

  firebaseTest(
    'Iterates over getRootFolders, and if a ".firebaserc" ' +
      'or "firebase.json" is found, returns its path',
    () => {
      const a = createTemporaryDirectory({ debugLabel: "a" });
      const b = createTemporaryDirectory({ debugLabel: "b" });
      createFile(b, ".firebaserc", "");
      const c = createTemporaryDirectory({ debugLabel: "c" });
      createFile(c, "firebase.json", "");

      const aFolder = createFake<vscode.WorkspaceFolder>({
        uri: vscode.Uri.file(a),
      });
      const bFolder = createFake<vscode.WorkspaceFolder>({
        uri: vscode.Uri.file(b),
      });
      const cFolder = createFake<vscode.WorkspaceFolder>({
        uri: vscode.Uri.file(c),
      });

      mock(workspace, { workspaceFolders: [aFolder, bFolder, cFolder] });
      assert.deepEqual(getConfigPath(), b, ".firebaserc is found first");

      mock(workspace, { workspaceFolders: [aFolder, cFolder, bFolder] });
      assert.deepEqual(getConfigPath(), c, "firebase.json is found first");
    }
  );

  firebaseTest("if no firebase config found, returns the first folder", () => {
    const a = createTemporaryDirectory({ debugLabel: "a" });
    const b = createTemporaryDirectory({ debugLabel: "b" });
    const c = createTemporaryDirectory({ debugLabel: "c" });

    const aFolder = createFake<vscode.WorkspaceFolder>({
      uri: vscode.Uri.file(a),
    });
    const bFolder = createFake<vscode.WorkspaceFolder>({
      uri: vscode.Uri.file(b),
    });
    const cFolder = createFake<vscode.WorkspaceFolder>({
      uri: vscode.Uri.file(c),
    });

    mock(workspace, { workspaceFolders: [aFolder, bFolder, cFolder] });
    assert.deepEqual(getConfigPath(), a);
  });

  firebaseTest('sets "cwd" global variable to the config path', () => {
    const a = createTemporaryDirectory();
    const aFolder = createFake<vscode.WorkspaceFolder>({
      uri: vscode.Uri.file(a),
    });

    mock(workspace, { workspaceFolders: [aFolder] });

    getConfigPath();

    assert.deepEqual(currentOptions.value.cwd, a);
  });
});

firebaseSuite("_readFirebaseConfig", () => {
  firebaseTest("parses firebase.json", () => {
    const expectedConfig = {
      emulators: {
        auth: {
          port: 9399,
        },
      },
    };

    const dir = createTemporaryDirectory();
    createFile(dir, "firebase.json", JSON.stringify(expectedConfig));

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    const config = _readFirebaseConfig();
    assert.deepEqual(config.requireValue.data, expectedConfig);
  });

  firebaseTest("returns undefined if firebase.json is not found", () => {
    const dir = createTemporaryDirectory();

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    const config = _readFirebaseConfig();
    assert.deepEqual(config, undefined);
  });

  firebaseTest("throws if firebase.json is invalid", () => {
    const logs = spyLogs();
    const dir = createTemporaryDirectory();
    createFile(dir, "firebase.json", "invalid json");

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    assert.equal(logs.error.length, 0);

    assert.throws(
      () => _readFirebaseConfig(),
      (thrown) =>
        thrown
          .toString()
          .startsWith(
            `FirebaseError: There was an error loading ${path.join(
              dir,
              "firebase.json"
            )}:`
          )
    );

    assert.equal(logs.error.length, 1);
    assert.ok(logs.error[0].startsWith("There was an error loading"));
  });
});

firebaseSuite("_readRC", () => {
  firebaseTest("parses .firebaserc", () => {
    const expectedConfig = {
      projects: {
        default: "my-project",
      },
    };

    const dir = createTemporaryDirectory();
    createFile(dir, ".firebaserc", JSON.stringify(expectedConfig));

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    const config = _readRC();
    assert.deepEqual(
      config?.requireValue.data.projects,
      expectedConfig.projects
    );
  });

  firebaseTest("returns undefined if .firebaserc is not found", () => {
    const dir = createTemporaryDirectory();

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    const config = _readRC();
    assert.deepEqual(config, undefined);
  });

  firebaseTest("throws if .firebaserc is invalid", () => {
    const logs = spyLogs();
    const dir = createTemporaryDirectory();
    createFile(dir, ".firebaserc", "invalid json");

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    assert.equal(logs.error.length, 0);

    assert.throws(
      () => _readRC(),
      (thrown) =>
        thrown.toString() ===
        `SyntaxError: Unexpected token 'i', "invalid json" is not valid JSON`
    );

    assert.equal(logs.error.length, 1);
    assert.equal(
      logs.error[0],
      `Unexpected token 'i', "invalid json" is not valid JSON`
    );
  });
});

firebaseSuite("_createWatcher", () => {
  // Those tests will impact global variables. We need to reset them after each test.
  teardown(() => resetGlobals());

  firebaseTest("returns undefined if cwd is not set", () => {
    mock(currentOptions, createFake<VsCodeOptions>({ cwd: undefined }));

    const watcher = _createWatcher("file");

    assert.equal(watcher, undefined);
  });

  firebaseTest("creates a watcher for the given file", async () => {
    const dir = createTemporaryDirectory();
    const file = createFile(dir, "file", "content");

    mock(currentOptions, createFake<VsCodeOptions>({ cwd: dir }));

    const watcher = _createWatcher("file")!;
    addTearDown(() => watcher.dispose());

    const createdFile = new Promise<vscode.Uri>((resolve) => {
      watcher.onDidChange((e) => resolve(e));
    });

    fs.writeFileSync(file, "new content");

    assert.equal((await createdFile).path, path.join(dir, "file"));
  });
});

firebaseSuite("registerConfig", () => {
  // Those tests will impact global variables. We need to reset them after each test.
  teardown(() => resetGlobals());

  firebaseTest(
    'sets "cwd" and firebaseRC/Config global variables on initial call',
    async () => {
      const expectedConfig = { emulators: { auth: { port: 9399 } } };
      const expectedRc = { projects: { default: "my-project" } };
      const broker = createTestBroker();
      const workspaces = setupMockTestWorkspaces({
        firebaseRc: expectedRc,
        firebaseConfig: expectedConfig,
      });

      const disposable = await registerConfig(broker);
      addDisposable(disposable);

      // Initial register should not notify anything.
      assert.deepEqual(broker.sentLogs, []);

      assert.deepEqual(currentOptions.value.cwd, workspaces.byIndex(0).path);
      assert.deepEqual(firebaseConfig.value.requireValue.data, expectedConfig);
      assert.deepEqual(
        firebaseRC.value.requireValue.data.projects,
        expectedRc.projects
      );
    }
  );

  firebaseTest(
    "when firebaseRC signal changes, calls notifyFirebaseConfig",
    async () => {
      const initialRC = { projects: { default: "my-project" } };
      const newRC = { projects: { default: "my-new-project" } };
      const broker = createTestBroker();
      setupMockTestWorkspaces({
        firebaseRc: initialRC,
      });

      const disposable = await registerConfig(broker);
      addDisposable(disposable);

      assert.deepEqual(broker.sentLogs, []);

      firebaseRC.value = new ResultValue(
        new RC(firebaseRC.value.requireValue.path, newRC)
      );

      assert.deepEqual(broker.sentLogs, [
        {
          message: "notifyFirebaseConfig",
          args: [
            {
              firebaseJson: undefined,
              firebaseRC: {
                etags: {},
                projects: {
                  default: "my-new-project",
                },
                targets: {},
              },
            },
          ],
        },
      ]);
    }
  );

  firebaseTest(
    "when firebaseConfig signal changes, calls notifyFirebaseConfig",
    async () => {
      const initialConfig = { emulators: { auth: { port: 9399 } } };
      const newConfig = { emulators: { auth: { port: 9499 } } };
      const broker = createTestBroker();
      const workspaces = setupMockTestWorkspaces({
        firebaseConfig: initialConfig,
      });

      const disposable = await registerConfig(broker);
      addDisposable(disposable);

      assert.deepEqual(broker.sentLogs, []);

      fs.writeFileSync(
        workspaces.byIndex(0).firebaseConfigPath,
        JSON.stringify(newConfig)
      );
      firebaseConfig.value = _readFirebaseConfig()!;

      assert.deepEqual(broker.sentLogs, [
        {
          message: "notifyFirebaseConfig",
          args: [
            {
              firebaseJson: {
                emulators: {
                  auth: {
                    port: 9499,
                  },
                },
              },
              firebaseRC: undefined,
            },
          ],
        },
      ]);
    }
  );

  firebaseTest("supports undefined working directory", async () => {
    const broker = createTestBroker();
    mock(currentOptions, { ...currentOptions.value, cwd: undefined });

    const disposable = await registerConfig(broker);
    addDisposable(disposable);

    // Should not throw.
  });

  firebaseTest("disposes of the watchers when disposed", async () => {
    const broker = createTestBroker();
    const dir = createTemporaryDirectory();

    const pendingWatchers = [];
    mock(
      workspace,
      createFake({
        workspaceFolders: [
          createFake<vscode.WorkspaceFolder>({ uri: vscode.Uri.file(dir) }),
        ],
        // Override "createFileSystemWatcher" to spy on the watchers.
        createFileSystemWatcher: () => {
          const watcher = createFake<vscode.FileSystemWatcher>({
            onDidCreate: () => ({ dispose: () => {} }),
            onDidChange: () => ({ dispose: () => {} }),
            dispose: () => {
              const index = pendingWatchers.indexOf(watcher);
              pendingWatchers.splice(index, 1);
            },
          });

          pendingWatchers.push(watcher);
          return watcher;
        },
      })
    );

    const disposable = await registerConfig(broker);
    addDisposable(disposable);

    assert.equal(pendingWatchers.length, 3);
    assert.deepEqual(Object.keys(broker.onListeners), ["getInitialData"]);

    disposable.dispose();

    assert.equal(pendingWatchers.length, 0);
    assert.deepEqual(Object.keys(broker.onListeners), []);

    firebaseConfig.value = new ResultValue(new Config(""));
    firebaseRC.value = new ResultValue(new RC());

    // Notifying firebaseConfig and firebaseRC should not call notifyFirebaseConfig
    assert.deepEqual(broker.sentLogs, []);
  });

  firebaseTest(
    "listens to create/update/delete events on firebase.json/.firebaserc/dataconnect.yaml",
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
        cb: (uri: vscode.Uri) => void
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
          createFileSystemWatcher: (pattern) => {
            const file = (pattern as vscode.RelativePattern).pattern;
            return createFake<vscode.FileSystemWatcher>({
              onDidCreate: (cb) => addFSListener(file, "create", cb),
              onDidChange: (cb) => addFSListener(file, "update", cb),
              onDidDelete: (cb) => addFSListener(file, "delete", cb),
              dispose: () => {},
            });
          },
        })
      );

      const broker = createTestBroker();

      const disposable = await registerConfig(broker);
      addDisposable(disposable);

      const rcListeners = watcherListeners[".firebaserc"]!;
      const rcFile = path.join(dir, ".firebaserc");
      const configListeners = watcherListeners["firebase.json"]!;
      const configFile = path.join(dir, "firebase.json");
      const dataConnectListeners =
        watcherListeners["**/{dataconnect,connector}.yaml"]!;
      const dataConnectFile = path.join(dir, "**/{dataconnect,connector}.yaml");

      function testEvent(
        index: number,
        file: string,
        content: string,
        fireWatcher: () => void
      ) {
        assert.equal(broker.sentLogs.length, index);

        fs.writeFileSync(file, content);
        fireWatcher();

        assert.equal(broker.sentLogs.length, index + 1);
      }

      function testRcEvent(
        event: "create" | "update" | "delete",
        index: number
      ) {
        testEvent(
          index,
          rcFile,
          JSON.stringify({ projects: { default: event } }),
          () => rcListeners[event]!(vscode.Uri.file(rcFile))
        );

        assert.deepEqual(broker.sentLogs[index].args[0].firebaseRC.projects, {
          default: event,
        });
      }

      function testConfigEvent(
        event: "create" | "update" | "delete",
        index: number
      ) {
        testEvent(
          index,
          configFile,
          JSON.stringify({ emulators: { auth: { port: index } } }),
          () => configListeners[event]!(vscode.Uri.file(configFile))
        );

        assert.deepEqual(broker.sentLogs[index].args[0].firebaseJson, {
          emulators: { auth: { port: index } },
        });
      }

      function testDataConnectEvent(event: "create" | "update" | "delete") {
        fs.writeFileSync(dataConnectFile, `specVersion: ${event}`);
        dataConnectListeners[event]!(vscode.Uri.file(dataConnectFile));

        assert.deepEqual(dataConnectConfigs.value, [{}]);
      }

      testRcEvent("create", 0);
      testRcEvent("update", 1);

      testConfigEvent("create", 2);
      testConfigEvent("update", 3);

      testDataConnectEvent("create");
      testDataConnectEvent("update");
    }
  );

  firebaseTest("handles getInitialData requests", async () => {
    const broker = createTestBroker();
    setupMockTestWorkspaces({
      firebaseRc: { projects: { default: "my-project" } },
      firebaseConfig: { emulators: { auth: { port: 9399 } } },
    });

    const disposable = await registerConfig(broker);
    addDisposable(disposable);

    broker.simulateOn("getInitialData");

    assert.deepEqual(broker.sentLogs, [
      {
        message: "notifyFirebaseConfig",
        args: [
          {
            firebaseJson: {
              emulators: {
                auth: {
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
});
