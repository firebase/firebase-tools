import { Octokit } from "@octokit/rest";
import { FileSystem } from "./types";

/**
 * Convert the Github remoteURL repository to a FileSystem.
 */
export class RepositoryFileSystem implements FileSystem {
  private repositoryName = "";
  private userName = "";
  private readonly existsCache: Record<string, boolean> = {};
  private readonly contentCache: Record<string, string | null> = {};

  constructor(repositoryURL: string) {
    this.extractRepositoryParameters(repositoryURL);
  }

  extractRepositoryParameters(repositoryURL: string) {
    // Fetech repository and username  name from the GitHub repository URL
    const regex = /https:\/\/github.com\/([^/]+)\/([^/]+)/;
    const match = regex.exec(repositoryURL);
    if (!match) {
      throw new Error("Invalid GitHub repository URL");
    }
    [, this.userName, this.repositoryName] = match;
  }

  exists(file: string): Promise<boolean> {
    try {
      if (!(file in this.contentCache)) {
        // Get repository contents
        const response = await new Octokit().repos.getContent({
          owner: this.userName,
          repo: this.repositoryName,
          path: file,
        });
        this.existsCache[file] = response.status === 200;
      }

      return Promise.resolve(this.existsCache[file]);
    } catch (error: any) {
      // File not found
      if (error.status === 404) {
        console.error("File you are looking for is not present in the repository");
        return Promise.resolve(false);
      }
      console.error("Unknown error occured while searching for file:", error.message);
      return Promise.resolve(false);
    }
  }

  read(file: string): Promise<string | null> {
    try {
      if (!(file in this.contentCache)) {
        // Get the repository contents
        const response = await new Octokit().repos.getContent({
          owner: this.userName,
          repo: this.repositoryName,
          path: file,
        });
        if (Array.isArray(response.data)) {
          // If the path has multiple files then it may be a directory.
          console.error(`The specified path '${file}' is a directory.`);
          this.contentCache[file] = null;
        }
        if ("content" in response.data) {
          const fileContents = Buffer.from(response.data.content, "base64").toString("utf-8");
          this.contentCache[file] = fileContents;
        }
        return Promise.resolve(this.contentCache[file]);
      }
      console.log("File content is in unsupported format or not available");
      return Promise.resolve(null);
    } catch (error: any) {
      console.error("Unknown error occured while reading for file contents:", error.message);
      return Promise.resolve(null);
    }
  }
}
