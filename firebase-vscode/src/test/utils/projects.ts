import * as path from "path";
import * as vscode from "vscode";

export const schemaPath = path.resolve(
  process.cwd(),
  "src/test/test_projects/fishfood/dataconnect/schema/schema.gql",
);


export const mutationsPath = path.resolve(
  process.cwd(),
  "src/test/test_projects/fishfood/dataconnect/connectors/a/mutations.gql",
);

export const queriesPath = path.resolve(
  process.cwd(),
  "src/test/test_projects/fishfood/dataconnect/connectors/a/queries.gql",
);

export const queryWithFragmentPath = path.resolve(
  process.cwd(),
  "src/test/test_projects/fishfood/dataconnect/connectors/a/queryWithFragment.gql",
);

export const firebaseRcPath = path.resolve(
  process.cwd(),
  "src/test/test_projects/empty/.firebaserc",
);

export const firebaseLogsPath = path.resolve(
  process.cwd(),
  "src/test/test_projects/empty/firebase-debug.log",
);

export async function mockProject(project: string): Promise<void> {
  return browser.executeWorkbench<void>(
    async (vs: typeof vscode, project: string) => {
      const promise = vs.commands.executeCommand(
        "fdc-graphql.mock.project",
        project,
      );
      return promise;
    },
    project,
  );
}
