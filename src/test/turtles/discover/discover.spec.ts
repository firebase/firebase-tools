import {expect} from "chai";
import {PackageManager} from "../../../turtles/interfaces";
import * as path from "path";
import {discover, discoverByDirectory, discoverByPackageManager, discoverProjectRecursively, getAdapterScore} from "../../../turtles/discover/discover";
import {NextJsAdapter, NpmAdapter} from "../../../turtles/adapters";

describe.only("discover", () => {
  describe("discover", () => {
    it("should return supplied adapter", async () => {
      const nextJsAdapterNode = {
        adapter: NextJsAdapter,
        children: []
      }
      const npmAdapterNode = {
        adapter: NpmAdapter,
        children: [nextJsAdapterNode]
      }
      const directory = path.resolve("mockdata/frameworks/nextjs");
      const metadata = {adapter: NpmAdapter, stack_directory: directory}
      const result = await discover(npmAdapterNode, metadata);

      /**
       * Interesting note:
       * The directory is a NextJs project.
       * But the supplied Adapter is NpmAdapter.
       * Both are technically true, the NextJs Adapter receives
       * a higher score (because its further away in the tree.),
       * but the supplied Adapter is Npm.
       */
      expect(result).to.deep.contain({
        adapter: NpmAdapter,
        directory: path.resolve("mockdata/frameworks/nextjs"),
        directory_depth: 0,
        confidence_score: 100
      });
    });

    it("should return adapter given stack_directory", async () => {
      const nextJsAdapterNode = {
        adapter: NextJsAdapter,
        children: []
      }
      const npmAdapterNode = {
        adapter: NpmAdapter,
        children: [nextJsAdapterNode]
      }
      const directory = path.resolve("mockdata/frameworks/nextjs");
      const metadata = {stack_directory: directory}
      const result = await discover(npmAdapterNode, metadata);

      expect(result).to.deep.contain({
        adapter: NextJsAdapter,
        directory: path.resolve("mockdata/frameworks/nextjs"),
        directory_depth: 0,
        confidence_score: 4
      });
    });
  });

  describe("discoverProjectRecursively", () => {
    it("should return discovered instance of nextjs from a parent directory", async () => {
      const nextJsAdapterNode = {
        adapter: NextJsAdapter,
        children: []
      }
      const npmAdapterNode = {
        adapter: NpmAdapter,
        children: [nextJsAdapterNode]
      }
      const directory = path.resolve("mockdata/frameworks");
      const result = await discoverProjectRecursively(npmAdapterNode, directory);

      expect(result.length).to.equal(8);
      expect(result).to.deep.contain({
        adapter: NextJsAdapter,
        directory: path.resolve("mockdata/frameworks/nextjs"),
        directory_depth: 1,
        confidence_score: 4
      });
    });
  });
  describe("discoverByDirectory", () => {
    it("should return discovered instance of nextjs", async () => {
      const nextJsAdapterNode = {
        adapter: NextJsAdapter,
        children: []
      }
      const npmAdapterNode = {
        adapter: NpmAdapter,
        children: [nextJsAdapterNode]
      }
      const directory = path.resolve("mockdata/frameworks/nextjs");
      const result = await discoverByDirectory(npmAdapterNode, directory);

      expect(result.length).to.equal(2);
      expect(result.some((res) => res.adapter === NpmAdapter)).to.equal(true);
      expect(result.some((res) => res.adapter === NextJsAdapter)).to.equal(true);
      expect(result).to.deep.contain({
        adapter: NextJsAdapter,
        directory: directory,
        directory_depth: 0,
        confidence_score: 4
      });
    });

    it("should not return discovered instance of nextjs", async () => {
      const nextJsAdapterNode = {
        adapter: NextJsAdapter,
        children: []
      }
      const npmAdapterNode = {
        adapter: NpmAdapter,
        children: [nextJsAdapterNode]
      }
      const directory = path.resolve("mockdata/frameworks/express");
      const result = await discoverByDirectory(npmAdapterNode, directory);

      expect(result.length).to.equal(1);
      expect(result.some((res) => res.adapter === NpmAdapter)).to.equal(true);
      expect(result.some((res) => res.adapter === NextJsAdapter)).to.equal(false);
    });
  });

  describe("getAdapterScore", () => {
    it("should return positive score for nextjs project", async () => {
      const adapter = NextJsAdapter;
      const directory = path.resolve("mockdata/frameworks/nextjs");
      const result = await getAdapterScore(adapter, directory);

      expect(result).to.be.gt(0);
    });

    it("should return 0 for non-nextjs project", async () => {
      const adapter = NextJsAdapter;
      const directory = path.resolve("mockdata/frameworks");
      const result = await getAdapterScore(adapter, directory);

      expect(result).to.equal(0);
    });
  });

  describe("discoverByPackageManager", () => {
    it("should successfully discover npm project", async () => {
      const packageDependency = {
        packageManager: PackageManager.NPM,
        dependency: "express",
      };
      const directory = path.resolve("mockdata/frameworks/express");
      const result = await discoverByPackageManager(packageDependency, directory);

      expect(result).to.equal(true);
    });

    it("should not discover npm from a non-npm project", async () => {
      const packageDependency = {
        packageManager: PackageManager.NPM,
        dependency: "express",
      };
      const directory = path.resolve("mockdata/frameworks");
      const result = await discoverByPackageManager(packageDependency, directory);

      expect(result).to.equal(false);
    });
  });
});
