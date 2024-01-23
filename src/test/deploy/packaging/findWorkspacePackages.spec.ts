import { tmpNameSync } from "tmp";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import {
  findWorkspacePackages,
  PackageJson,
} from "../../../deploy/functions/packaging/findWorkspacePackages";
import * as yaml from "js-yaml";
import { expect } from "chai";

function write(base: string, files: Record<string, string | object>): void {
  for (const f of Object.keys(files)) {
    const val = files[f];
    const content = typeof val === "string" ? val : JSON.stringify(val, null, 2);
    mkdirSync(dirname(join(base, f)), { recursive: true });
    writeFileSync(join(base, f), content, "utf8");
  }
}

function createPackage(name: string): PackageJson {
  return {
    name: name,
  };
}

describe("findWorkspacePackages", () => {
  it("should find workspace packages based on globs", () => {
    const tmpDir = tmpNameSync({ prefix: "functions-workspace-" });
    write(tmpDir, {
      "apps/app-a/package.json": createPackage("app-a"),
      "libs/lib-a/package.json": createPackage("lib-a"),
      "libs/lib-b/package.json": createPackage("lib-b"),
      "pnpm-workspace.yaml": yaml.dump({
        packages: ["apps/app-a", "libs/*"],
      }),
    });
    const packages = findWorkspacePackages(tmpDir);
    expect(packages).to.have.property("app-a");
    expect(packages).to.have.property("lib-a");
    expect(packages).to.have.property("lib-b");
  });
});
