import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  _createWatcher,
  _getConfigPath,
  _readFirebaseConfig,
  _readFirematConfig,
  _readRC,
  firebaseConfig,
  firebaseRC,
  firematConfig,
  getRootFolders,
  registerConfig,
} from "../../core/config";
import {
  addDisposable,
  addTearDown,
  firematSuite,
  firematTest,
} from "../utils/test_hooks";
import { createFake, mock } from "../utils/mock";
import { resetGlobals } from "../../utils/globals";
import { workspace } from "../../utils/test_hooks";
import { createFile, createTemporaryDirectory } from "../utils/fs";
import { VsCodeOptions, currentOptions } from "../../options";
import { spyLogs } from "../utils/logs";
import { createTestBroker } from "../utils/broker";
import { setupMockTestWorkspaces } from "../utils/workspace";
import { RC } from "../../../../src/rc";
import { Config } from "../../../../src/config";

firematSuite("getRootFolders", () => {
  firematTest("if workspace is empty, returns an empty array", () => {
    mock(workspace, undefined);

    const result = getRootFolders();

    assert.deepEqual(result, []);
  });

  firematTest(
    "if workspace.workspaceFolders is undefined, returns an empty array",
    () => {
      mock(workspace, {
        workspaceFolders: undefined,
      });

      const result = getRootFolders();

      assert.deepEqual(result, []);
    },
  );

  firematTest("returns an array of paths", () => {
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

  firematTest("includes workspaceFile's directory if set", () => {
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

  firematTest("filters path duplicates", () => {
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

firematSuite("_getConfigPath", () => {
  // Those tests will impact global variables. We need to reset them after each test.
  teardown(() => resetGlobals());

  firematTest(
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
      assert.deepEqual(_getConfigPath(), b, ".firebaserc is found first");

      mock(workspace, { workspaceFolders: [aFolder, cFolder, bFolder] });
      assert.deepEqual(_getConfigPath(), c, "firebase.json is found first");
    },
  );

  firematTest("if no firebase config found, returns the first folder", () => {
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
    assert.deepEqual(_getConfigPath(), a);
  });

  firematTest('sets "cwd" global variable to the config path', () => {
    const a = createTemporaryDirectory();
    const aFolder = createFake<vscode.WorkspaceFolder>({
      uri: vscode.Uri.file(a),
    });

    mock(workspace, { workspaceFolders: [aFolder] });

    _getConfigPath();

    assert.deepEqual(currentOptions.value.cwd, a);
  });
});

firematSuite("_readFirematConfig", () => {
  const defaultConfigYaml = `
specVersion: v1alpha
schema:
  main:
    source: ./api/schema
    connection:
      connectionString: postgresql://postgres:mypassword@localhost:5432/emulator?sslmode=disable
operationSet:
  crud:
    source: ./api/operations
`;

  firematTest("parses firemat.yaml", () => {
    const dir = createTemporaryDirectory();
    createFile(dir, "firemat.yaml", defaultConfigYaml);

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    const config = _readFirematConfig();
    assert.deepEqual(config, {
      specVersion: "v1alpha",
      schema: {
        main: {
          source: path.join(dir, "api", "schema"),
          connection: {
            connectionString:
              "postgresql://postgres:mypassword@localhost:5432/emulator?sslmode=disable",
          },
        },
      },
      operationSet: {
        crud: {
          source: path.join(dir, "api", "operations"),
        },
      },
    });
  });

  firematTest("returns undefined if firemat.yaml is not found", () => {
    const dir = createTemporaryDirectory();

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    const config = _readFirematConfig();
    assert.deepEqual(config, undefined);
  });

  firematTest("throws if firemat.yaml is invalid", () => {
    const logs = spyLogs();
    const dir = createTemporaryDirectory();
    createFile(dir, "firemat.yaml", "||");

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    assert.equal(logs.error.length, 0);

    assert.throws(
      () => _readFirematConfig(),
      (thrown) =>
        thrown
          .toString()
          .startsWith(`YAMLException: a line break is expected (1:2)`),
    );

    assert.equal(logs.error.length, 1);
    assert.ok(
      logs.error[0].startsWith(`YAMLException: a line break is expected (1:2)`),
    );
  });

  firematTest("specifies default value when fields are missing", () => {
    const dir = createTemporaryDirectory();
    createFile(dir, "firemat.yaml", `unknown: 42`);

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    const config = _readFirematConfig();

    assert.deepEqual(config, {
      specVersion: "v1alpha",
      schema: {
        main: {
          source: path.join(dir, "api", "schema"),
          connection: {
            connectionString: undefined,
          },
        },
      },
      operationSet: {
        crud: {
          source: path.join(dir, "api", "operations"),
        },
      },
    });
  });

  firematTest("decodes the yaml", () => {
    const dir = createTemporaryDirectory();
    createFile(
      dir,
      "firemat.yaml",
      `
specVersion: v2
schema:
  main:
    source: './foo'
    connection:
      connectionString: 'password'
operationSet:
  crud:
    source: './bar'
`,
    );

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    const config = _readFirematConfig();

    assert.deepEqual(config, {
      specVersion: "v2",
      schema: {
        main: {
          source: path.join(dir, "foo"),
          connection: {
            connectionString: "password",
          },
        },
      },
      operationSet: {
        crud: {
          source: path.join(dir, "bar"),
        },
      },
    });
  });

  firematTest("converts null values into the associated default", () => {
    const dir = createTemporaryDirectory();
    createFile(
      dir,
      "firemat.yaml",
      `
specVersion: null
schema:
  main:
    source: null
    connection:
      connectionString: null
operationSet:
  crud:
    source: null
`,
    );

    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    const config = _readFirematConfig();

    assert.deepEqual(config, {
      specVersion: "v1alpha",
      schema: {
        main: {
          source: path.join(dir, "api", "schema"),
          connection: {
            connectionString: undefined,
          },
        },
      },
      operationSet: {
        crud: {
          source: path.join(dir, "api", "operations"),
        },
      },
    });
  });

  firematTest("asserts that values are of the correct type", () => {
    const dir = createTemporaryDirectory();
    mock(workspace, {
      workspaceFolders: [
        createFake<vscode.WorkspaceFolder>({
          uri: vscode.Uri.file(dir),
        }),
      ],
    });

    createFile(dir, "firemat.yaml", `specVersion: 42`);
    assert.throws(
      () => _readFirematConfig(),
      (thrown) =>
        thrown
          .toString()
          .startsWith(
            `Error: Expected field at firemat.yaml#specVersion to be of type string but got number`,
          ),
    );

    createFile(
      dir,
      "firemat.yaml",
      `
schema:
  main:
    source: 42
`,
    );
    assert.throws(
      () => _readFirematConfig(),
      (thrown) => thrown.toString().includes(`firemat.yaml#schema.main.source`),
    );

    createFile(
      dir,
      "firemat.yaml",
      `
schema:
  main:
    connection:
      connectionString: 42
`,
    );
    assert.throws(
      () => _readFirematConfig(),
      (thrown) =>
        thrown
          .toString()
          .includes(`firemat.yaml#schema.main.connection.connectionString`),
    );

    createFile(
      dir,
      "firemat.yaml",
      `
operationSet:
  crud:
    source: 42
`,
    );
    assert.throws(
      () => _readFirematConfig(),
      (thrown) =>
        thrown.toString().includes(`firemat.yaml#operationSet.crud.source`),
    );
  });
});

firematSuite("_readConfig", () => {
  firematTest("parses firebase.json", () => {
    const expectedConfig = {
      emulators: {
        firemat: {
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
    assert.deepEqual(config.data, expectedConfig);
  });

  firematTest("returns undefined if firebase.json is not found", () => {
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

  firematTest("throws if firebase.json is invalid", () => {
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
              "firebase.json",
            )}:`,
          ),
    );

    assert.equal(logs.error.length, 1);
    assert.ok(logs.error[0].startsWith("There was an error loading"));
  });
});

firematSuite("_readRC", () => {
  firematTest("parses .firebaserc", () => {
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
    assert.deepEqual(config?.data.projects, expectedConfig.projects);
  });

  firematTest("returns undefined if .firebaserc is not found", () => {
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

  firematTest("throws if .firebaserc is invalid", () => {
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
        `SyntaxError: Unexpected token 'i', "invalid json" is not valid JSON`,
    );

    assert.equal(logs.error.length, 1);
    assert.equal(
      logs.error[0],
      `Unexpected token 'i', "invalid json" is not valid JSON`,
    );
  });
});

firematSuite("_createWatcher", () => {
  // Those tests will impact global variables. We need to reset them after each test.
  teardown(() => resetGlobals());

  firematTest("returns undefined if cwd is not set", () => {
    mock(currentOptions, createFake<VsCodeOptions>({ cwd: undefined }));

    const watcher = _createWatcher("file");

    assert.equal(watcher, undefined);
  });

  firematTest("creates a watcher for the given file", async () => {
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

firematSuite("registerConfig", () => {
  // Those tests will impact global variables. We need to reset them after each test.
  teardown(() => resetGlobals());

  firematTest(
    'sets "cwd" and firebaseRC/Config global variables on initial call',
    () => {
      const expectedConfig = { emulators: { firemat: { port: 9399 } } };
      const expectedRc = { projects: { default: "my-project" } };
      const broker = createTestBroker();
      const workspaces = setupMockTestWorkspaces({
        firebaseRc: expectedRc,
        firebaseConfig: expectedConfig,
      });

      const disposable = registerConfig(broker);
      addDisposable(disposable);

      // Initial register should not notify anything.
      assert.deepEqual(broker.sentLogs, []);

      assert.deepEqual(currentOptions.value.cwd, workspaces.byIndex(0).path);
      assert.deepEqual(firebaseConfig.value.data, expectedConfig);
      assert.deepEqual(firebaseRC.value.data.projects, expectedRc.projects);
    },
  );

  firematTest(
    "when firebaseRC signal changes, calls notifyFirebaseConfig",
    () => {
      const initialRC = { projects: { default: "my-project" } };
      const newRC = { projects: { default: "my-new-project" } };
      const broker = createTestBroker();
      setupMockTestWorkspaces({
        firebaseRc: initialRC,
      });

      const disposable = registerConfig(broker);
      addDisposable(disposable);

      assert.deepEqual(broker.sentLogs, []);

      firebaseRC.value = new RC(firebaseRC.value.path, newRC);

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
    },
  );

  firematTest(
    "when firebaseConfig signal changes, calls notifyFirebaseConfig",
    () => {
      const initialConfig = { emulators: { firemat: { port: 9399 } } };
      const newConfig = { emulators: { firemat: { port: 9499 } } };
      const broker = createTestBroker();
      const workspaces = setupMockTestWorkspaces({
        firebaseConfig: initialConfig,
      });

      const disposable = registerConfig(broker);
      addDisposable(disposable);

      assert.deepEqual(broker.sentLogs, []);

      fs.writeFileSync(
        workspaces.byIndex(0).firebaseConfigPath,
        JSON.stringify(newConfig),
      );
      firebaseConfig.value = _readFirebaseConfig()!;

      assert.deepEqual(broker.sentLogs, [
        {
          message: "notifyFirebaseConfig",
          args: [
            {
              firebaseJson: {
                emulators: {
                  firemat: {
                    port: 9499,
                  },
                },
              },
              firebaseRC: undefined,
            },
          ],
        },
      ]);
    },
  );

  firematTest("supports undefined working directory", () => {
    const broker = createTestBroker();
    mock(currentOptions, { ...currentOptions.value, cwd: undefined });

    const disposable = registerConfig(broker);
    addDisposable(disposable);

    // Should not throw.
  });

  firematTest("disposes of the watchers when disposed", () => {
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
      }),
    );

    const disposable = registerConfig(broker);
    addDisposable(disposable);

    assert.equal(pendingWatchers.length, 3);
    assert.deepEqual(Object.keys(broker.onListeners), ["getInitialData"]);

    disposable.dispose();

    assert.equal(pendingWatchers.length, 0);
    assert.deepEqual(Object.keys(broker.onListeners), []);

    firebaseConfig.value = new Config("");
    firebaseRC.value = new RC();

    // Notifying firebaseConfig and firebaseRC should not call notifyFirebaseConfig
    assert.deepEqual(broker.sentLogs, []);
  });

  firematTest(
    "listens to create/update/delete events on firebase.json/.firebaserc/firemat.yaml",
    () => {
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
          createFileSystemWatcher: (pattern) => {
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

      const broker = createTestBroker();

      const disposable = registerConfig(broker);
      addDisposable(disposable);

      const rcListeners = watcherListeners[".firebaserc"]!;
      const rcFile = path.join(dir, ".firebaserc");
      const configListeners = watcherListeners["firebase.json"]!;
      const configFile = path.join(dir, "firebase.json");
      const firematListeners = watcherListeners["firemat.yaml"]!;
      const firematFile = path.join(dir, "firemat.yaml");

      function testEvent(
        index: number,
        file: string,
        content: string,
        fireWatcher: () => void,
      ) {
        assert.equal(broker.sentLogs.length, index);

        fs.writeFileSync(file, content);
        fireWatcher();

        assert.equal(broker.sentLogs.length, index + 1);
      }

      function testRcEvent(
        event: "create" | "update" | "delete",
        index: number,
      ) {
        testEvent(
          index,
          rcFile,
          JSON.stringify({ projects: { default: event } }),
          () => rcListeners[event]!(vscode.Uri.file(rcFile)),
        );

        assert.deepEqual(broker.sentLogs[index].args[0].firebaseRC.projects, {
          default: event,
        });
      }

      function testConfigEvent(
        event: "create" | "update" | "delete",
        index: number,
      ) {
        testEvent(
          index,
          configFile,
          JSON.stringify({ emulators: { firemat: { port: index } } }),
          () => configListeners[event]!(vscode.Uri.file(configFile)),
        );

        assert.deepEqual(broker.sentLogs[index].args[0].firebaseJson, {
          emulators: { firemat: { port: index } },
        });
      }

      function testFirematEvent(event: "create" | "update" | "delete") {
        fs.writeFileSync(firematFile, `specVersion: ${event}`);
        firematListeners[event]!(vscode.Uri.file(firematFile));

        assert.deepEqual(firematConfig.value.specVersion, event);
      }

      testRcEvent("create", 0);
      testRcEvent("update", 1);

      testConfigEvent("create", 2);
      testConfigEvent("update", 3);

      testFirematEvent("create");
      testFirematEvent("update");
    },
  );

  firematTest("handles getInitialData requests", () => {
    const broker = createTestBroker();
    setupMockTestWorkspaces({
      firebaseRc: { projects: { default: "my-project" } },
      firebaseConfig: { emulators: { firemat: { port: 9399 } } },
    });

    const disposable = registerConfig(broker);
    addDisposable(disposable);

    broker.simulateOn("getInitialData");

    assert.deepEqual(broker.sentLogs, [
      {
        message: "notifyFirebaseConfig",
        args: [
          {
            firebaseJson: {
              emulators: {
                firemat: {
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
