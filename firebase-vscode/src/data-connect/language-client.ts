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
import { GraphQLConfig } from "graphql-config";

export function setupLanguageClient(
  context,
  configs: ResolvedDataConnectConfigs,
) {
  // activate language client/serer
  const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(
    "Firebase GraphQL Language Server",
  );

  const serverPath = path.join("dist", "server.js");
  const serverModule = context.asAbsolutePath(serverPath);

  // Pass schema, document paths to generate a graphql-config in the language-server
  // TODO: Expand to multiple services
  const config = configs.values[0];
  const generatedPath = ".dataconnect";
  const schemaPaths = [`./${config.relativeSchemaPath}/**/*.gql`, `./${config.relativePath}/${generatedPath}/**/*.gql`];
  const documentPaths = config.relativeConnectorPaths.map(
    (connectorPath) => `./${connectorPath}/**/*.gql`,
  );

  const fdcEnv = { schemaPaths: JSON.stringify(schemaPaths), documentPaths: JSON.stringify(documentPaths) };
  // const fdcEnv = { graphql_config: JSON.stringify(graphqlConfig) };
  const debugOptions = {
    execArgv: ["--nolazy", "--inspect=localhost:6009"],
    env: fdcEnv,
  };

  const runOptions = {
    env: fdcEnv,
  };

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: runOptions,
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

  vscode.commands.registerCommand("fdc-graphql.restart", async () => {
    outputChannel.appendLine("Stopping Firebase GraphQL Language Server");
    await client.stop();

    outputChannel.appendLine("Restarting Firebase GraphQL Language Server");
    await client.start();
    outputChannel.appendLine("Firebase GraphQL Language Server restarted");
  });

  const restartGraphqlLSP = () => {
    vscode.commands.executeCommand("fdc-graphql.restart");
  };

  // restart server whenever config file changes
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/.graphqlrc.*", // TODO: extend to schema files, and other config types
    false,
    false,
    false,
  );
  watcher.onDidChange(() => restartGraphqlLSP());

  return client;
}
