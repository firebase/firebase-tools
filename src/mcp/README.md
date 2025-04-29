# Firebase MCP Server

The Firebase MCP Server provides assistive utilities to compatible AI-assistant
development tools.

## Usage

The Firebase MCP server uses the Firebase CLI for authentication and project
selection. You will usually want to start the server with a specific directory
as an argument to operate against the project of your working directory.

For clients that don't operate within a specific workspace, the Firebase MCP
server makes tools available to read and write a project directory.

### Example: Cursor

In `.cursor/mcp.json` in your workspace directory, add the Firebase MCP server:

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools", "experimental:mcp", "--dir", "<your_absolute_workspace_dir>"]
    }
  }
}
```

### Command Line Options

- `--dir <absolute_dir_path>`: The absolute path of a directory containing `firebase.json` to set a project context for the MCP server. If unspecified, the `{get|set}_firebase_directory` tools will become available and the default directory will be the working directory where the MCP server was started.
- `--only <feature1,feature2>`: A comma-separated list of feature groups to activate. Use this to limit the tools exposed to only features you are actively using.

## Tools

| Tool Name                | Feature Group | Description                                                                                                         |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `get_firebase_directory` | `core`        | When running without the `--dir` command, retrieves the current directory (defaults to current working directory).  |
| `set_firebase_directory` | `core`        | When running without the `--dir` command, sets the current project directory (i.e. one with `firebase.json` in it). |
| `get_project`            | `project`     | Get basic information about the active project in the current Firebase directory.                                   |
| `list_apps`              | `project`     | List registered apps for the currently active project.                                                              |
| `get_sdk_config`         | `project`     | Get an Firebase client SDK config for a specific platform.                                                          |
