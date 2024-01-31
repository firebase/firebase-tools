import { expect } from "chai";
import { getLoginCredential, getTestDevices } from "../../appdistribution/options-parser-util";
import { FirebaseError } from "../../error";

describe("options-parser-util", () => {
  describe("getTestDevices", () => {
    it("parses a test device", () => {
      const optionValue = "model=modelname,version=123,orientation=landscape,locale=en_US";

      const result = getTestDevices(optionValue, "");

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

      const result = getTestDevices(optionValue, "");

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

      const result = getTestDevices(optionValue, "");

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

      expect(() => getTestDevices(optionValue, "")).to.throw(
        FirebaseError,
        "model=<model-id>,version=<os-version-id>,locale=<locale>,orientation=<orientation>",
      );
    });

    it("throws an error with expected fields when field is unexpected", () => {
      const optionValue =
        "model=modelname,version=123,orientation=landscape,locale=en_US,notafield=blah";

      expect(() => getTestDevices(optionValue, "")).to.throw(
        FirebaseError,
        "model, version, orientation, locale",
      );
    });
  });

  describe("getLoginCredential", () => {
    it("returns credential for username and password", () => {
      const result = getLoginCredential("user", "123");

      expect(result).to.deep.equal({
        username: "user",
        password: "123",
        fieldHints: undefined,
      });
    });

    it("returns undefined when no options provided", () => {
      const result = getLoginCredential();

      expect(result).to.be.undefined;
    });

    it("returns credential for username, password, and resource names", () => {
      const result = getLoginCredential(
        "user",
        "123",
        "username_resource_id",
        "password_resource_id",
      );

      expect(result).to.deep.equal({
        username: "user",
        password: "123",
        fieldHints: {
          usernameResourceName: "username_resource_id",
          passwordResourceName: "password_resource_id",
        },
      });
    });

    it("throws error when username and password not provided together", () => {
      expect(() => getLoginCredential("user", undefined)).to.throw(
        FirebaseError,
        "Username and password for automated tests need to be specified together",
      );
    });

    it("throws error when username but not password resources not provided together", () => {
      expect(() => getLoginCredential("user", "123", undefined, "password_resource_id")).to.throw(
        FirebaseError,
        "Username and password resource names for automated tests need to be specified together",
      );
    });

    it("throws error when resource names provided without username and password", () => {
      expect(() =>
        getLoginCredential(undefined, undefined, "username_resource_id", "password_resource_id"),
      ).to.throw(FirebaseError, "Must specify username and password");
    });
  });
});
