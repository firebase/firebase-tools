import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./functions-kits-uninstall";
import { Config } from "../config";
import { FirebaseError } from "../error";
import { requireConfig } from "../requireConfig";

describe("functions:kits:uninstall", () => {
  const originalBefores = [
    ...((command as unknown as { befores: Array<{ fn: unknown; args: unknown[] }> }).befores || []),
  ];

  beforeEach(() => {
    sinon.stub(command, "prepare").resolves();
  });

  afterEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [...originalBefores];
    sinon.restore();
  });

  describe("command prerequisites", () => {
    it("should throw an error and not start uninstall if requireConfig is not met", async () => {
      await expect(
        command.runner()({
          kit: "my-kit",
          cwd: "/mock/project",
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(FirebaseError, /could not locate firebase\.json/);
    });

    it("should throw an error and not start uninstall if requireAuth is not met", async () => {
      const mockConfig = {
        projectDir: "/mock/project",
        src: { functions: [] },
        path: (p: string) => `/mock/project/${p}`,
      } as unknown as Config;

      const authError = new FirebaseError(
        "Command requires authentication, please run firebase login",
      );
      const requireAuthStub = sinon.stub().rejects(authError);
      (command as unknown as { befores: unknown[] }).befores = [
        { fn: requireConfig, args: [] },
        { fn: requireAuthStub, args: [] },
      ];

      await expect(
        command.runner()({
          kit: "my-kit",
          cwd: "/mock/project",
          config: mockConfig,
          nonInteractive: true,
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Command requires authentication, please run firebase login",
      );
    });
  });
});
