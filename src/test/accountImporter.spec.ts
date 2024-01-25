import * as nock from "nock";
import { expect } from "chai";

import { googleOrigin } from "../api";

import * as accountImporter from "../accountImporter";

describe("accountImporter", () => {
  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  const transArrayToUser = accountImporter.transArrayToUser;
  const validateOptions = accountImporter.validateOptions;
  const validateUserJson = accountImporter.validateUserJson;
  const serialImportUsers = accountImporter.serialImportUsers;

  describe("transArrayToUser", () => {
    it("should reject when passwordHash is invalid base64", () => {
      expect(transArrayToUser(["123", undefined, undefined, "false"])).to.have.property("error");
    });

    it("should not reject when passwordHash is valid base64", () => {
      expect(
        transArrayToUser(["123", undefined, undefined, "Jlf7onfLbzqPNFP/1pqhx6fQF/w="]),
      ).to.not.have.property("error");
    });
  });

  describe("validateOptions", () => {
    it("should reject when unsupported hash algorithm provided", () => {
      expect(() => validateOptions({ hashAlgo: "MD2" })).to.throw();
    });

    it("should reject when missing parameters", () => {
      expect(() => validateOptions({ hashAlgo: "HMAC_SHA1" })).to.throw();
    });
  });

  describe("validateUserJson", () => {
    it("should reject when unknown fields in user json", () => {
      expect(
        validateUserJson({
          uid: "123",
          email: "test@test.org",
        }),
      ).to.have.property("error");
    });

    it("should reject when unknown fields in providerUserInfo of user json", () => {
      expect(
        validateUserJson({
          localId: "123",
          email: "test@test.org",
          providerUserInfo: [
            {
              providerId: "google.com",
              googleId: "abc",
              email: "test@test.org",
            },
          ],
        }),
      ).to.have.property("error");
    });

    it("should reject when unknown providerUserInfo of user json", () => {
      expect(
        validateUserJson({
          localId: "123",
          email: "test@test.org",
          providerUserInfo: [
            {
              providerId: "otheridp.com",
              rawId: "abc",
              email: "test@test.org",
            },
          ],
        }),
      ).to.have.property("error");
    });

    it("should reject when passwordHash is invalid base64", () => {
      expect(
        validateUserJson({
          localId: "123",
          passwordHash: "false",
        }),
      ).to.have.property("error");
    });

    it("should not reject when passwordHash is valid base64", () => {
      expect(
        validateUserJson({
          localId: "123",
          passwordHash: "Jlf7onfLbzqPNFP/1pqhx6fQF/w=",
        }),
      ).to.not.have.property("error");
    });
  });

  describe("serialImportUsers", () => {
    let batches: { localId: string; email: string }[][] = [];
    const hashOptions = {
      hashAlgo: "HMAC_SHA1",
      hashKey: "a2V5MTIz",
    };
    let expectedResponse: { status: number; body: any }[] = [];

    beforeEach(() => {
      for (let i = 0; i < 10; i++) {
        batches.push([
          {
            localId: i.toString(),
            email: `test${i}@test.org`,
          },
        ]);
        expectedResponse.push({
          status: 200,
          body: {},
        });
      }
    });

    afterEach(() => {
      batches = [];
      expectedResponse = [];
    });

    it("should call api.request multiple times", async () => {
      for (let i = 0; i < batches.length; i++) {
        nock(googleOrigin)
          .post("/identitytoolkit/v3/relyingparty/uploadAccount", {
            hashAlgorithm: "HMAC_SHA1",
            signerKey: "a2V5MTIz",
            targetProjectId: "test-project-id",
            users: [{ email: `test${i}@test.org`, localId: i.toString() }],
          })
          .once()
          .reply(expectedResponse[i].status, expectedResponse[i].body);
      }
      await serialImportUsers("test-project-id", hashOptions, batches, 0);
      expect(nock.isDone()).to.be.true;
    });

    it("should continue when some request's response is 200 but has `error` in response", async () => {
      expectedResponse[5] = {
        status: 200,
        body: {
          error: [
            {
              index: 0,
              message: "some error message",
            },
          ],
        },
      };
      for (let i = 0; i < batches.length; i++) {
        nock(googleOrigin)
          .post("/identitytoolkit/v3/relyingparty/uploadAccount", {
            hashAlgorithm: "HMAC_SHA1",
            signerKey: "a2V5MTIz",
            targetProjectId: "test-project-id",
            users: [{ email: `test${i}@test.org`, localId: i.toString() }],
          })
          .once()
          .reply(expectedResponse[i].status, expectedResponse[i].body);
      }
      await serialImportUsers("test-project-id", hashOptions, batches, 0);
      expect(nock.isDone()).to.be.true;
    });
  });
});
