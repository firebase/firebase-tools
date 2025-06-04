import * as vscode from "vscode";
import {
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  RevealOutputChannelOn,
  LanguageClient,
} from "vscode-languageclient/node";
import * as path from "node:path";
import { ResolvedDataConnectConfigs } from "./config";

export function setupLanguageClient(
  context: vscode.ExtensionContext,
  configs: ResolvedDataConnectConfigs,
  outputChannel: vscode.OutputChannel,
) {
  const serverPath = path.join("dist", "server.js");
  const serverModule = context.asAbsolutePath(serverPath);

  const debugOptions = {
    execArgv: ["--nolazy", "--inspect=localhost:6009"],
  };

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "graphql" }],
    synchronize: {
      // TODO: This should include any referenced graphql files inside the graphql-config
      fileEvents: [
        vscode.workspace.createFileSystemWatcher(
          "/{graphql.config.*,.graphqlrc,.graphqlrc.*,package.json}",
          false,
          // Ignore change events for graphql config, we only care about create, delete and save events
          // otherwise, the underlying language service is re-started on every key change.
          // also, it makes sense that it should only re-load on file save, but we need to document that.
          // TODO: perhaps we can intercept change events, and remind the user
          // to save for the changes to take effect
          true,
        ),
        // TODO: load ignore file
        // These ignore node_modules and .git by default
        vscode.workspace.createFileSystemWatcher(
          "**/{*.graphql,*.graphqls,*.gql,*.js,*.mjs,*.cjs,*.esm,*.es,*.es6,*.jsx,*.ts,*.tsx,*.vue,*.svelte,*.cts,*.mts}",
        ),
      ],
    },
    outputChannel,
    outputChannelName: "GraphQL Language Server",
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    initializationFailedHandler: (err) => {
      outputChannel.appendLine("Initialization failed");
      outputChannel.appendLine(err.message);
      if (err.stack) {
        outputChannel.appendLine(err.stack);
      }
      outputChannel.show();
      return false;
    },
  };

  // Create the language client and start the client.
  const client = new LanguageClient(
    "graphQLlanguageServer",
    "GraphQL Language Server",
    serverOptions,
    clientOptions,
  );

  // register commands
  const commandShowOutputChannel = vscode.commands.registerCommand(
    "fdc-graphql.showOutputChannel",
    () => outputChannel.show(),
  );

  context.subscriptions.push(commandShowOutputChannel);

  const generateYamlFile = async () => {
    const basePath = vscode.workspace.rootPath;
    const filePath = ".firebase/.graphqlrc";
    const fileUri = vscode.Uri.file(`${basePath}/${filePath}`);
    const folderPath = ".firebase";
    const folderUri = vscode.Uri.file(`${basePath}/${folderPath}`);

    // TODO: Expand to multiple services
    const config = configs.values[0];
    const generatedPath = ".dataconnect";
    path.join(config.relativeSchemaPath, "**", "*.gql");
    let schemaPaths = [
      path.join(config.relativeSchemaPath, "**", "*.gql"),
      path.join(config.relativePath, generatedPath, "**", "*.gql"),
    ];
    let documentPaths = config.relativeConnectorPaths.map((connectorPath) =>
      path.join(connectorPath, "**", "*.gql"),
    );

    // make non windows paths relative
    // TODO: figure out why relative paths are absolute on windows
    if (process.platform !== "win32") {
      schemaPaths = schemaPaths.map((schemaPath) =>
        path.join("..", schemaPath),
      );
      documentPaths = documentPaths.map((documentPath) =>
        path.join("..", documentPath),
      );
    }

    const yamlJson = JSON.stringify({
      schema: schemaPaths,
      document: documentPaths,
    });
    // create folder if needed
    if (!vscode.workspace.getWorkspaceFolder(folderUri)) {
      vscode.workspace.fs.createDirectory(folderUri);
    }
    vscode.workspace.fs.writeFile(fileUri, Buffer.from(yamlJson));
  };

  vscode.commands.registerCommand("fdc-graphql.restart", async () => {
    outputChannel.appendLine("Stopping Firebase GraphQL Language Server");
    await client.stop();
    await generateYamlFile();
    outputChannel.appendLine("Restarting Firebase GraphQL Language Server");
    await client.start();
    outputChannel.appendLine("Firebase GraphQL Language Server restarted");
  });

  vscode.commands.registerCommand("fdc-graphql.start", async () => {
    await generateYamlFile();
    await client.start();
    outputChannel.appendLine("Firebase GraphQL Language Server restarted");
  });

  // ** DISABLED FOR NOW WHILE WE TEST GENERATED YAML **
  // restart server whenever config file changes
  // const watcher = vscode.workspace.createFileSystemWatcher(
  //   "**/.graphqlrc.*", // TODO: extend to schema files, and other config types
  //   false,
  //   false,
  //   false,
  // );
  // watcher.onDidChange(() => restartGraphqlLSP());

  return client;
}
