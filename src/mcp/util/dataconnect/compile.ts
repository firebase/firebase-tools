import { prettify } from "../../../dataconnect/graphqlError";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";

export async function compileErrors(
  configDir: string,
  errorFilter?: "all" | "schema" | "operations",
) {
  const errors = (await DataConnectEmulator.build({ configDir })).errors;
  return (
    errors
      ?.filter((e) => {
        const isOperationError = ["query", "mutation"].includes(e.path?.[0] as string);
        if (errorFilter === "operations") return isOperationError;
        if (errorFilter === "schema") return !isOperationError;
        return true;
      })
      .map(prettify)
      .join("\n") || ""
  );
}
