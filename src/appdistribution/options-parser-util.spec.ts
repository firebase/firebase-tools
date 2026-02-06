import { expect } from "chai";
import { getLoginCredential, parseTestDevices } from "./options-parser-util";
import { FirebaseError } from "../error";
import * as fs from "fs-extra";
import { rmSync } from "node:fs";
import * as tmp from "tmp";
import { join } from "path";

tmp.setGracefulCleanup();

describe("options-parser-util", () => {
  const tempdir = tmp.dirSync();
  const passwordFile = join(tempdir.name, "password.txt");
  fs.outputFileSync(passwordFile, "password-from-file\n");

  after(() => {
    rmSync(tempdir.name, { recursive: true });
  });

  describe("getTestDevices", () => {
    it("parses a test device", () => {
      const optionValue = "model=modelname,version=123,orientation=landscape,locale=en_US";

      const result = parseTestDevices(optionValue, "");

      expect(result).to.deep.equal([
        {
          model: "modelname",
          version: "123",
          orientation: "landscape",
          locale: "en_US",
        },
      ]);
    });

    it("parses multiple semicolon-separated test devices", () => {
      const optionValue =
        "model=modelname,version=123,orientation=landscape,locale=en_US;model=modelname2,version=456,orientation=portrait,locale=es";

      const result = parseTestDevices(optionValue, "");

      expect(result).to.deep.equal([
        {
          model: "modelname",
          version: "123",
          orientation: "landscape",
          locale: "en_US",
        },
        {
          model: "modelname2",
          version: "456",
          orientation: "portrait",
          locale: "es",
        },
      ]);
    });

    it("parses multiple newline-separated test devices", () => {
      const optionValue =
        "model=modelname,version=123,orientation=landscape,locale=en_US\nmodel=modelname2,version=456,orientation=portrait,locale=es";

      const result = parseTestDevices(optionValue, "");

      expect(result).to.deep.equal([
        {
          model: "modelname",
          version: "123",
          orientation: "landscape",
          locale: "en_US",
        },
        {
          model: "modelname2",
          version: "456",
          orientation: "portrait",
          locale: "es",
        },
      ]);
    });

    it("throws an error with correct format when missing a field", () => {
      const optionValue = "model=modelname,version=123,locale=en_US";

      expect(() => parseTestDevices(optionValue, "")).to.throw(
        FirebaseError,
        "model=<model-id>,version=<os-version-id>,locale=<locale>,orientation=<orientation>",
      );
    });

    it("throws an error with expected fields when field is unexpected", () => {
      const optionValue =
        "model=modelname,version=123,orientation=landscape,locale=en_US,notafield=blah";

      expect(() => parseTestDevices(optionValue, "")).to.throw(
        FirebaseError,
        "model, version, orientation, locale",
      );
    });
  });

  describe("getLoginCredential", () => {
    it("returns credential for username and password", () => {
      const result = getLoginCredential({ username: "user", password: "123" });

      expect(result).to.deep.equal({
        username: "user",
        password: "123",
        fieldHints: undefined,
      });
    });

    it("returns credential for username and passwordFile", () => {
      const result = getLoginCredential({ username: "user", passwordFile });

      expect(result).to.deep.equal({
        username: "user",
        password: "password-from-file",
        fieldHints: undefined,
      });
    });

    it("returns undefined when no options provided", () => {
      const result = getLoginCredential({});

      expect(result).to.be.undefined;
    });

    it("returns credential for username, password, and resource names", () => {
      const result = getLoginCredential({
        username: "user",
        password: "123",
        usernameResourceName: "username_resource_id",
        passwordResourceName: "password_resource_id",
      });

      expect(result).to.deep.equal({
        username: "user",
        password: "123",
        fieldHints: {
          usernameResourceName: "username_resource_id",
          passwordResourceName: "password_resource_id",
        },
      });
    });

    it("returns credential for username, passwordFile, and resource names", () => {
      const result = getLoginCredential({
        username: "user",
        passwordFile,
        usernameResourceName: "username_resource_id",
        passwordResourceName: "password_resource_id",
      });

      expect(result).to.deep.equal({
        username: "user",
        password: "password-from-file",
        fieldHints: {
          usernameResourceName: "username_resource_id",
          passwordResourceName: "password_resource_id",
        },
      });
    });

    it("throws error when username and password not provided together", () => {
      expect(() => getLoginCredential({ username: "user" })).to.throw(
        FirebaseError,
        "Username and password for automated tests need to be specified together",
      );
    });

    it("throws error when password (but not username) resource provided", () => {
      expect(() =>
        getLoginCredential({
          username: "user",
          password: "123",
          passwordResourceName: "password_resource_id",
        }),
      ).to.throw(
        FirebaseError,
        "Username and password resource names for automated tests need to be specified together",
      );
    });

    it("throws error when password file and password (but not username) resource provided", () => {
      expect(() =>
        getLoginCredential({
          username: "user",
          passwordFile,
          passwordResourceName: "password_resource_id",
        }),
      ).to.throw(
        FirebaseError,
        "Username and password resource names for automated tests need to be specified together",
      );
    });

    it("throws error when resource names provided without username and password", () => {
      expect(() =>
        getLoginCredential({
          usernameResourceName: "username_resource_id",
          passwordResourceName: "password_resource_id",
        }),
      ).to.throw(FirebaseError, "Must specify username and password");
    });
  });
});
