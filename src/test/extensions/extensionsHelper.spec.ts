import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import * as generateInstanceId from "../../extensions/generateInstanceId";
import * as extensionsHelper from "../../extensions/extensionsHelper";
import * as prompt from "../../prompt";

describe("extensionsHelper", () => {
  describe("substituteParams", () => {
    it("should should substitute env variables", () => {
      const testResources = [
        {
          resourceOne: {
            name: "${VAR_ONE}",
            source: "path/${VAR_ONE}",
          },
        },
        {
          resourceTwo: {
            property: "${VAR_TWO}",
            another: "$NOT_ENV",
          },
        },
      ];
      const testParam = { VAR_ONE: "foo", VAR_TWO: "bar", UNUSED: "faz" };
      expect(extensionsHelper.substituteParams(testResources, testParam)).to.deep.equal([
        {
          resourceOne: {
            name: "foo",
            source: "path/foo",
          },
        },
        {
          resourceTwo: {
            property: "bar",
            another: "$NOT_ENV",
          },
        },
      ]);
    });
  });

  describe("getDBInstanceFromURL", () => {
    it("returns the correct instance name", () => {
      expect(extensionsHelper.getDBInstanceFromURL("https://my-db.firebaseio.com")).to.equal(
        "my-db"
      );
    });
  });

  describe("populateDefaultParams", () => {
    const expected = {
      ENV_VAR_ONE: "12345",
      ENV_VAR_TWO: "hello@example.com",
      ENV_VAR_THREE: "https://${PROJECT_ID}.firebaseapp.com/?acceptInvitation={token}",
      ENV_VAR_FOUR: "users/{sender}.friends",
    };

    const exampleParamSpec = [
      {
        param: "ENV_VAR_ONE",
        required: true,
      },
      {
        param: "ENV_VAR_TWO",
        required: true,
        validationRegex: "^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$",
        validationErrorMessage: "You must provide a valid email address.\n",
      },
      {
        param: "ENV_VAR_THREE",
        default: "https://${PROJECT_ID}.firebaseapp.com/?acceptInvitation={token}",
        validationRegex: ".*\\{token\\}.*",
        validationErrorMessage:
          "Your URL must include {token} so that it can be replaced with an actual invitation token.\n",
      },
      {
        param: "ENV_VAR_FOUR",
        default: "users/{sender}.friends",
        required: false,
        validationRegex: ".+/.+\\..+",
        validationErrorMessage:
          "Values must be comma-separated document path + field, e.g. coll/doc.field,coll/doc.field\n",
      },
    ];

    it("should set default if default is available", () => {
      const envFile = {
        ENV_VAR_ONE: "12345",
        ENV_VAR_TWO: "hello@example.com",
        ENV_VAR_THREE: "https://${PROJECT_ID}.firebaseapp.com/?acceptInvitation={token}",
      };

      expect(extensionsHelper.populateDefaultParams(envFile, exampleParamSpec)).to.deep.equal(
        expected
      );
    });

    it("should throw error if no default is available", () => {
      const envFile = {
        ENV_VAR_ONE: "12345",
        ENV_VAR_THREE: "https://${PROJECT_ID}.firebaseapp.com/?acceptInvitation={token}",
        ENV_VAR_FOUR: "users/{sender}.friends",
      };

      expect(() => {
        extensionsHelper.populateDefaultParams(envFile, exampleParamSpec);
      }).to.throw(FirebaseError, /no default available/);
    });
  });

  describe("validateCommandLineParams", () => {
    const exampleParamSpec = [
      {
        param: "ENV_VAR_ONE",
        required: true,
      },
      {
        param: "ENV_VAR_TWO",
        required: true,
        validationRegex: "^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$",
        validationErrorMessage: "You must provide a valid email address.\n",
      },
      {
        param: "ENV_VAR_THREE",
        default: "https://${PROJECT_ID}.firebaseapp.com/?acceptInvitation={token}",
        validationRegex: ".*\\{token\\}.*",
        validationErrorMessage:
          "Your URL must include {token} so that it can be replaced with an actual invitation token.\n",
      },
      {
        param: "ENV_VAR_FOUR",
        default: "users/{sender}.friends",
        required: false,
        validationRegex: ".+/.+\\..+",
        validationErrorMessage:
          "Values must be comma-separated document path + field, e.g. coll/doc.field,coll/doc.field\n",
      },
    ];

    it("should throw error if param variable value is invalid", () => {
      const envFile = {
        ENV_VAR_ONE: "12345",
        ENV_VAR_TWO: "invalid",
        ENV_VAR_THREE: "https://${PROJECT_ID}.firebaseapp.com/?acceptInvitation={token}",
        ENV_VAR_FOUR: "users/{sender}.friends",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(envFile, exampleParamSpec);
      }).to.throw(FirebaseError, /not valid/);
    });

    it("should throw error if # commandLineParams does not match # env vars from extension.yaml", () => {
      const envFile = {
        ENV_VAR_ONE: "12345",
        ENV_VAR_TWO: "invalid",
        ENV_VAR_THREE: "https://${PROJECT_ID}.firebaseapp.com/?acceptInvitation={token}",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(envFile, exampleParamSpec);
      }).to.throw(FirebaseError, /param is missing/);
    });
  });
  describe("getValidInstanceId", () => {
    let promptStub: sinon.SinonStub;
    let generateInstanceIdStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
      generateInstanceIdStub = sinon.stub(generateInstanceId, "generateInstanceId");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("return extensionName if it is not used by another instance ", async () => {
      const extensionName = "extension-name";
      generateInstanceIdStub.resolves(extensionName);
      promptStub.returns("a-valid-name");

      const instanceId = await extensionsHelper.getValidInstanceId("proj", extensionName);

      expect(instanceId).to.equal(extensionName);
      expect(promptStub).not.to.have.been.called;
    });

    it("prompt the user if extensionName is already used, and return if the user provides a valid id", async () => {
      const extensionName = "extension-name";
      const userInput = "a-valid-name";
      generateInstanceIdStub.resolves(`${extensionName}-abcd`);
      promptStub.returns(userInput);

      const instanceId = await extensionsHelper.getValidInstanceId("proj", extensionName);

      expect(instanceId).to.equal(userInput);
      expect(promptStub).to.have.been.calledOnce;
    });

    it("prompt the user again if the provided id is shorter than 6 characters", async () => {
      const extensionName = "extension-name";
      const userInput1 = "short";
      const userInput2 = "a-valid-name";
      generateInstanceIdStub.resolves(`${extensionName}-abcd`);
      promptStub.onCall(0).returns(userInput1);
      promptStub.onCall(1).returns(userInput2);

      const instanceId = await extensionsHelper.getValidInstanceId("proj", extensionName);

      expect(instanceId).to.equal(userInput2);
      expect(promptStub).to.have.been.calledTwice;
    });

    it("prompt the user again if the provided id is longer than 45 characters", async () => {
      const extensionName = "extension-name";
      const userInput1 = "a-really-long-name-that-is-really-longer-than-were-ok-with";
      const userInput2 = "a-valid-name";
      generateInstanceIdStub.resolves(`${extensionName}-abcd`);
      promptStub.onCall(0).returns(userInput1);
      promptStub.onCall(1).returns(userInput2);

      const instanceId = await extensionsHelper.getValidInstanceId("proj", extensionName);

      expect(instanceId).to.equal(userInput2);
      expect(promptStub).to.have.been.calledTwice;
    });

    it("prompt the user again if the provided id ends in a -", async () => {
      const extensionName = "extension-name";
      const userInput1 = "invalid-";
      const userInput2 = "-invalid";
      const userInput3 = "a-valid-name";
      generateInstanceIdStub.resolves(`${extensionName}-abcd`);
      promptStub.onCall(0).returns(userInput1);
      promptStub.onCall(1).returns(userInput2);
      promptStub.onCall(2).returns(userInput3);

      const instanceId = await extensionsHelper.getValidInstanceId("proj", extensionName);

      expect(instanceId).to.equal(userInput3);
      expect(promptStub).to.have.been.calledThrice;
    });

    it("prompt the user again if the provided id starts with a number", async () => {
      const extensionName = "extension-name";
      const userInput1 = "1invalid";
      const userInput2 = "a-valid-name";
      generateInstanceIdStub.resolves(`${extensionName}-abcd`);
      promptStub.onCall(0).returns(userInput1);
      promptStub.onCall(1).returns(userInput2);

      const instanceId = await extensionsHelper.getValidInstanceId("proj", extensionName);

      expect(instanceId).to.equal(userInput2);
      expect(promptStub).to.have.been.calledTwice;
    });

    it("prompt the user again if the provided id contains illegal characters", async () => {
      const extensionName = "extension-name";
      const userInput1 = "na.name@name";
      const userInput2 = "a-valid-name";
      generateInstanceIdStub.resolves(`${extensionName}-abcd`);
      promptStub.onCall(0).returns(userInput1);
      promptStub.onCall(1).returns(userInput2);

      const instanceId = await extensionsHelper.getValidInstanceId("proj", extensionName);

      expect(instanceId).to.equal(userInput2);
      expect(promptStub).to.have.been.calledTwice;
    });
  });
});
