import { execSync } from "child_process";

async function installExtensions() {
  // List of extensions to install
  const extensions: string[] = ["graphql.vscode-graphql-syntax"];

  // Install each extension
  extensions.forEach((extension) => {
    try {
      console.log(`Installing ${extension}...`);
      execSync(`code --install-extension ${extension}`, {
        stdio: "inherit",
      });
      console.log(`${extension} installed successfully.`);
    } catch (error) {
      console.error(`Failed to install ${extension}:`, error);
      process.exit(1);
    }
  });
}

// Ensure this script runs as part of the WebDriverIO setup
export default async function setupVscodeEnv() {
  await installExtensions();
}
