import { expect } from "chai";
import * as sinon from "sinon";
import * as clc from "colorette";

import * as secrets from "../../../apphosting/secrets";
import * as dialogs from "../../../apphosting/secrets/dialogs";
import * as apphosting from "../../../gcp/apphosting";
import * as utilsImport from "../../../utils";
import * as promptImport from "../../../prompt";

describe("dialogs", () => {
  const modernA = {
    name: "projects/p/locations/l/backends/modernA",
    serviceAccount: "a",
  } as any as apphosting.Backend;
  const modernA2 = {
    name: "projects/p/locations/l2/backends/modernA2",
    serviceAccount: "a",
  } as any as apphosting.Backend;
  const modernB = {
    name: "projects/p/locations/l/backends/modernB",
    serviceAccount: "b",
  } as any as apphosting.Backend;
  const legacy = {
    name: "projects/p/locations/l/backends/legacy",
  } as any as apphosting.Backend;
  const legacy2 = {
    name: "projects/p/locations/l/backends/legacy2",
  } as any as apphosting.Backend;

  describe("toMetadata", () => {
    it("handles explicit account", () => {
      // Note: passing in out of order to verify the results are sorted.
      const metadata = dialogs.toMetadata("number", [modernA2, modernA]);

      expect(metadata).to.deep.equal([
        { location: "l", id: "modernA", serviceAccounts: ["a"] },
        { location: "l2", id: "modernA2", serviceAccounts: ["a"] },
      ]);
    });

    it("handles fallback for legacy SAs", () => {
      const metadata = dialogs.toMetadata("number", [modernA, legacy]);

      expect(metadata).to.deep.equal([
        {
          location: "l",
          id: "legacy",
          serviceAccounts: secrets.serviceAccountsForBackend("number", legacy),
        },
        { location: "l", id: "modernA", serviceAccounts: ["a"] },
      ]);
    });

    it("sorts by location first and id second", () => {
      const metadata = dialogs.toMetadata("number", [legacy, modernA, modernA2]);
      expect(metadata).to.deep.equal([
        {
          location: "l",
          id: "legacy",
          serviceAccounts: secrets.serviceAccountsForBackend("number", legacy),
        },
        { location: "l", id: "modernA", serviceAccounts: ["a"] },
        { location: "l2", id: "modernA2", serviceAccounts: ["a"] },
      ]);
    });
  });

  describe("tableForBackends", () => {
    it("uses 'service account' header if all backends use one service account", () => {
      const table = dialogs.tableForBackends(dialogs.toMetadata("number", [modernA, modernB]));
      expect(table[0]).to.deep.equal(["location", "backend", "service account"]);
      expect(table[1]).to.deep.equal([
        ["l", "modernA", "a"],
        ["l", "modernB", "b"],
      ]);
    });

    it("uses 'service accounts' header if any backend uses more than one service accont", () => {
      const table = dialogs.tableForBackends(dialogs.toMetadata("number", [legacy, modernA]));
      const legacyAccounts = secrets.serviceAccountsForBackend("number", legacy);
      expect(table[0]).to.deep.equal(["location", "backend", "service accounts"]);
      expect(table[1]).to.deep.equal([
        [
          "l",
          "legacy",
          legacyAccounts.join(", "),
        ],
        ["l", "modernA", "a"],
      ]);
    });
  });

  describe("selectBackendServiceAccounts", () => {
    let listBackends: sinon.SinonStub;
    let utils: sinon.SinonStubbedInstance<typeof utilsImport>;
    let prompt: sinon.SinonStubbedInstance<typeof promptImport>;

    beforeEach(() => {
      listBackends = sinon.stub(apphosting, "listBackends");
      utils = sinon.stub(utilsImport);
      prompt = sinon.stub(promptImport);
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("handles no backends", async () => {
      listBackends.resolves({
        backends: [],
        unreachable: [],
      });

      await expect(
        dialogs.selectBackendServiceAccounts("number", "id", {}),
      ).to.eventually.deep.equal([]);
      expect(utils.logLabeledWarning).to.have.been.calledWith(
        "apphosting",
        dialogs.WARN_NO_BACKENDS,
      );
    });

    it("handles unreachable regions", async () => {
      listBackends.resolves({
        backends: [],
        unreachable: ["us-central1"],
      });

      await expect(
        dialogs.selectBackendServiceAccounts("number", "id", {}),
      ).to.eventually.deep.equal([]);

      expect(utils.logLabeledWarning).to.have.been.calledWith(
        "apphosting",
        `Could not reach location(s) us-central1. You may need to run ${clc.bold("firebase apphosting:secrets:grantAccess")} ` +
          "at a later time if you have backends in these locations",
      );
      expect(utils.logLabeledWarning).to.have.been.calledWith(
        "apphosting",
        dialogs.WARN_NO_BACKENDS,
      );
    });

    it("handles a single backend (opt yes)", async () => {
      listBackends.resolves({
        backends: [modernA],
        unreachable: [],
      });
      prompt.confirm.resolves(true);

      await expect(
        dialogs.selectBackendServiceAccounts("number", "id", {}),
      ).to.eventually.deep.equal([modernA.serviceAccount]);

      expect(prompt.confirm).to.have.been.calledWith({
        nonInteractive: undefined,
        default: true,
        message:
          "To use this secret, your backend's service account must have secret accessor permission. Would you like to grant it now?",
      });
      expect(utils.logLabeledBullet).to.not.have.been.called;
    });

    it("handles a single backend (opt no)", async () => {
      listBackends.resolves({
        backends: [modernA],
        unreachable: [],
      });
      prompt.confirm.resolves(false);

      await expect(
        dialogs.selectBackendServiceAccounts("number", "id", {}),
      ).to.eventually.deep.equal([]);

      expect(prompt.confirm).to.have.been.calledWith({
        nonInteractive: undefined,
        default: true,
        message:
          "To use this secret, your backend's service account must have secret accessor permission. Would you like to grant it now?",
      });
      expect(utils.logLabeledBullet).to.have.been.calledWith(
        "apphosting",
        dialogs.GRANT_ACCESS_IN_FUTURE,
      );
    });

    it("handles multiple backends with the same (multiple) SAs (opt yes)", async () => {
      listBackends.resolves({
        backends: [legacy, legacy2],
        unreachable: [],
      });
      prompt.confirm.resolves(true);
      const accounts = secrets.serviceAccountsForBackend("number", legacy);

      await expect(
        dialogs.selectBackendServiceAccounts("number", "id", {}),
      ).to.eventually.deep.equal(accounts);

      expect(utils.logLabeledBullet).to.have.been.calledWith(
        "apphosting",
        "To use this secret, your backend's service account must have secret accessor permission. " +
          `All of your backends use service accounts ${accounts.join(", ")}. ` +
          "Granting access to one backend will grant access to all backends.",
      );
      expect(prompt.confirm).to.have.been.calledWith({
        nonInteractive: undefined,
        default: true,
        message: "Would you like to grant it now?",
      });
      expect(utils.logLabeledBullet).to.have.been.calledOnce;
    });

    it("handles multiple backends with the same (multiple) SAs (opt no)", async () => {
      listBackends.resolves({
        backends: [legacy, legacy2],
        unreachable: [],
      });
      prompt.confirm.resolves(false);
      const legacyAccounts = secrets.serviceAccountsForBackend("number", legacy);

      await expect(
        dialogs.selectBackendServiceAccounts("number", "id", {}),
      ).to.eventually.deep.equal([]);

      expect(utils.logLabeledBullet).to.have.been.calledWith(
        "apphosting",
        "To use this secret, your backend's service account must have secret accessor permission. " +
          `All of your backends use service accounts ${legacyAccounts.join(", ")}. ` +
          "Granting access to one backend will grant access to all backends.",
      );
      expect(prompt.confirm).to.have.been.calledWith({
        nonInteractive: undefined,
        default: true,
        message: "Would you like to grant it now?",
      });
      expect(utils.logLabeledBullet).to.have.been.calledWith(
        "apphosting",
        dialogs.GRANT_ACCESS_IN_FUTURE,
      );
    });

    it("handles multiple backends with the same (single) SA (opt yes)", async () => {
      listBackends.resolves({
        backends: [modernA, modernA2],
        unreachable: [],
      });
      prompt.confirm.resolves(true);

      await expect(
        dialogs.selectBackendServiceAccounts("number", "id", {}),
      ).to.eventually.deep.equal([modernA.serviceAccount]);

      expect(utils.logLabeledBullet).to.have.been.calledWith(
        "apphosting",
        "To use this secret, your backend's service account must have secret accessor permission. " +
          "All of your backends use service account a. Granting access to one backend will grant access " +
          "to all backends.",
      );
      expect(prompt.confirm).to.have.been.calledWith({
        nonInteractive: undefined,
        default: true,
        message: "Would you like to grant it now?",
      });
      expect(utils.logLabeledBullet).to.have.been.calledOnce;
    });

    it("handles multiple backends with the same (single) SA (opt no)", async () => {
      listBackends.resolves({
        backends: [modernA, modernA2],
        unreachable: [],
      });
      prompt.confirm.resolves(false);

      await expect(
        dialogs.selectBackendServiceAccounts("number", "id", {}),
      ).to.eventually.deep.equal([]);

      expect(utils.logLabeledBullet).to.have.been.calledWith(
        "apphosting",
        "To use this secret, your backend's service account must have secret accessor permission. " +
          "All of your backends use service account a. Granting access to one backend will grant access " +
          "to all backends.",
      );
      expect(prompt.confirm).to.have.been.calledWith({
        nonInteractive: undefined,
        default: true,
        message: "Would you like to grant it now?",
      });
      expect(utils.logLabeledBullet).to.have.been.calledWith(
        "apphosting",
        dialogs.GRANT_ACCESS_IN_FUTURE,
      );
    });

    it("handles multiple backends with different SAs (select some)", async () => {
      listBackends.resolves({
        backends: [modernA, modernA2, modernB, legacy, legacy2],
        unreachable: [],
      });
      prompt.promptOnce.resolves(["a", "b"]);
      const legacyAccounts = secrets.serviceAccountsForBackend("number", legacy);

      await expect(
        dialogs.selectBackendServiceAccounts("number", "id", {}),
      ).to.eventually.deep.equal(["a", "b"]);

      expect(prompt.promptOnce).to.have.been.calledWith({
        type: "checkbox",
        message:
          "Which service accounts would you like to grant access? Press Space to select accounts, then Enter to confirm your choices.",
        choices: [
          "a",
          "b",
          ...legacyAccounts,
        ].sort(),
      });
      expect(utils.logLabeledBullet).to.have.been.calledWith(
        "apphosting",
        "To use this secret, your backend's service account must have secret accessor permission. Your backends use the following service accounts:",
      );
      expect(utils.logLabeledBullet).to.not.have.been.calledWith(
        "apphosting",
        dialogs.GRANT_ACCESS_IN_FUTURE,
      );
    });

    it("handles multiple backends with different SAs (select none)", async () => {
      listBackends.resolves({
        backends: [modernA, modernA2, modernB, legacy, legacy2],
        unreachable: [],
      });
      prompt.promptOnce.resolves([]);
      const legacyAccounts = secrets.serviceAccountsForBackend("number", legacy);

      await expect(
        dialogs.selectBackendServiceAccounts("number", "id", {}),
      ).to.eventually.deep.equal([]);

      expect(prompt.promptOnce).to.have.been.calledWith({
        type: "checkbox",
        message:
          "Which service accounts would you like to grant access? Press Space to select accounts, then Enter to confirm your choices.",
        choices: [
          "a",
          "b",
          ...legacyAccounts,
        ].sort(),
      });
      expect(utils.logLabeledBullet).to.have.been.calledWith(
        "apphosting",
        "To use this secret, your backend's service account must have secret accessor permission. Your backends use the following service accounts:",
      );
      expect(utils.logLabeledBullet).to.have.been.calledWith(
        "apphosting",
        dialogs.GRANT_ACCESS_IN_FUTURE,
      );
    });
  });

  describe("envVarForSecret", () => {
    let prompt: sinon.SinonStubbedInstance<typeof promptImport>;
    let utils: sinon.SinonStubbedInstance<typeof utilsImport>;

    beforeEach(() => {
      prompt = sinon.stub(promptImport);
      utils = sinon.stub(utilsImport);
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("accepts a valid env var", async () => {
      await expect(dialogs.envVarForSecret("VALID_KEY")).to.eventually.equal("VALID_KEY");
      expect(prompt.promptOnce).to.not.have.been.called;
    });

    it("suggests a valid upper case name", async () => {
      prompt.promptOnce.resolves("SECRET_VALUE");

      await expect(dialogs.envVarForSecret("secret-value")).to.eventually.equal("SECRET_VALUE");
      expect(prompt.promptOnce).to.have.been.calledWithMatch({
        message: "What environment variable name would you like to use?",
        default: "SECRET_VALUE",
      });
    });

    it("prevents invalid keys", async () => {
      prompt.promptOnce.onFirstCall().resolves("secret-value");
      prompt.promptOnce.onSecondCall().resolves("SECRET_VALUE");

      await expect(dialogs.envVarForSecret("secret-value")).to.eventually.equal("SECRET_VALUE");
      expect(prompt.promptOnce).to.have.been.calledWithMatch({
        message: "What environment variable name would you like to use?",
        default: "SECRET_VALUE",
      });
      expect(prompt.promptOnce).to.have.been.calledTwice;
      expect(utils.logLabeledError).to.have.been.calledWith(
        "apphosting",
        "Key secret-value must start with an uppercase ASCII letter or underscore, and then consist of uppercase ASCII letters, digits, and underscores.",
      );
    });

    it("prevents reserved keys", async () => {
      prompt.promptOnce.onFirstCall().resolves("PORT");
      prompt.promptOnce.onSecondCall().resolves("SECRET_VALUE");

      await expect(dialogs.envVarForSecret("secret-value")).to.eventually.equal("SECRET_VALUE");
      expect(prompt.promptOnce).to.have.been.calledWithMatch({
        message: "What environment variable name would you like to use?",
        default: "SECRET_VALUE",
      });
      expect(prompt.promptOnce).to.have.been.calledTwice;
      expect(utils.logLabeledError).to.have.been.calledWith(
        "apphosting",
        "Key PORT is reserved for internal use.",
      );
    });

    it("prevents reserved prefixes", async () => {
      prompt.promptOnce.onFirstCall().resolves("X_GOOGLE_SECRET");
      prompt.promptOnce.onSecondCall().resolves("SECRET_VALUE");

      await expect(dialogs.envVarForSecret("secret-value")).to.eventually.equal("SECRET_VALUE");
      expect(prompt.promptOnce).to.have.been.calledWithMatch({
        message: "What environment variable name would you like to use?",
        default: "SECRET_VALUE",
      });
      expect(prompt.promptOnce).to.have.been.calledTwice;
      expect(utils.logLabeledError).to.have.been.calledWithMatch(
        "apphosting",
        /Key X_GOOGLE_SECRET starts with a reserved prefix/,
      );
    });
  });
});
