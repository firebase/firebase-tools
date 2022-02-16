import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../error";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as extensionsHelper from "../../extensions/extensionsHelper";
import * as resolveSource from "../../extensions/resolveSource";
import { storage } from "../../gcp";
import * as archiveDirectory from "../../archiveDirectory";
import * as prompt from "../../prompt";
import { ExtensionSource } from "../../extensions/extensionsApi";

describe("extensionsHelper", () => {
  describe("substituteParams", () => {
    it("should substitute env variables", () => {
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
      expect(extensionsHelper.substituteParams<any>(testResources, testParam)).to.deep.equal([
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

  it("should support both ${PARAM_NAME} AND ${param:PARAM_NAME} syntax", () => {
    const testResources = [
      {
        resourceOne: {
          name: "${param:VAR_ONE}",
          source: "path/${param:VAR_ONE}",
        },
      },
      {
        resourceTwo: {
          property: "${param:VAR_TWO}",
          another: "$NOT_ENV",
        },
      },
      {
        resourceThree: {
          property: "${VAR_TWO}${VAR_TWO}${param:VAR_TWO}",
          another: "${not:VAR_TWO}",
        },
      },
    ];
    const testParam = { VAR_ONE: "foo", VAR_TWO: "bar", UNUSED: "faz" };
    expect(extensionsHelper.substituteParams<any>(testResources, testParam)).to.deep.equal([
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
      {
        resourceThree: {
          property: "barbarbar",
          another: "${not:VAR_TWO}",
        },
      },
    ]);
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
      ENV_VAR_THREE: "https://${PROJECT_ID}.web.app/?acceptInvitation={token}",
    };

    const exampleParamSpec: extensionsApi.Param[] = [
      {
        param: "ENV_VAR_ONE",
        label: "env1",
        required: true,
      },
      {
        param: "ENV_VAR_TWO",
        label: "env2",
        required: true,
        validationRegex: "^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$",
        validationErrorMessage: "You must provide a valid email address.\n",
      },
      {
        param: "ENV_VAR_THREE",
        label: "env3",
        default: "https://${PROJECT_ID}.web.app/?acceptInvitation={token}",
        validationRegex: ".*\\{token\\}.*",
        validationErrorMessage:
          "Your URL must include {token} so that it can be replaced with an actual invitation token.\n",
      },
      {
        param: "ENV_VAR_FOUR",
        label: "env4",
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
        ENV_VAR_THREE: "https://${PROJECT_ID}.web.app/?acceptInvitation={token}",
      };

      expect(extensionsHelper.populateDefaultParams(envFile, exampleParamSpec)).to.deep.equal(
        expected
      );
    });

    it("should throw error if no default is available", () => {
      const envFile = {
        ENV_VAR_ONE: "12345",
        ENV_VAR_THREE: "https://${PROJECT_ID}.web.app/?acceptInvitation={token}",
        ENV_VAR_FOUR: "users/{sender}.friends",
      };

      expect(() => {
        extensionsHelper.populateDefaultParams(envFile, exampleParamSpec);
      }).to.throw(FirebaseError, /no default available/);
    });
  });

  describe("validateCommandLineParams", () => {
    const exampleParamSpec: extensionsApi.Param[] = [
      {
        param: "ENV_VAR_ONE",
        label: "env1",
        required: true,
      },
      {
        param: "ENV_VAR_TWO",
        label: "env2",
        required: true,
        validationRegex: "^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$",
        validationErrorMessage: "You must provide a valid email address.\n",
      },
      {
        param: "ENV_VAR_THREE",
        label: "env3",
        default: "https://${PROJECT_ID}.web.app/?acceptInvitation={token}",
        validationRegex: ".*\\{token\\}.*",
        validationErrorMessage:
          "Your URL must include {token} so that it can be replaced with an actual invitation token.\n",
      },
      {
        param: "ENV_VAR_FOUR",
        label: "env3",
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
        ENV_VAR_THREE: "https://${PROJECT_ID}.web.app/?acceptInvitation={token}",
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
        ENV_VAR_THREE: "https://${PROJECT_ID}.web.app/?acceptInvitation={token}",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(envFile, exampleParamSpec);
      }).to.throw(FirebaseError);
    });

    it("should throw an error if a required param is missing", () => {
      const testParamSpec = [
        {
          param: "HI",
          label: "hello",
          required: true,
        },
        {
          param: "BYE",
          label: "goodbye",
          required: false,
        },
      ];
      const testParams = {
        BYE: "val",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(testParams, testParamSpec);
      }).to.throw(FirebaseError);
    });

    it("should not throw a error if a non-required param is missing", () => {
      const testParamSpec = [
        {
          param: "HI",
          label: "hello",
          required: true,
        },
        {
          param: "BYE",
          label: "goodbye",
          required: false,
        },
      ];
      const testParams = {
        HI: "val",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(testParams, testParamSpec);
      }).not.to.throw();
    });

    it("should not throw a regex error if a non-required param is missing", () => {
      const testParamSpec = [
        {
          param: "BYE",
          label: "goodbye",
          required: false,
          validationRegex: "FAIL",
        },
      ];
      const testParams = {};

      expect(() => {
        extensionsHelper.validateCommandLineParams(testParams, testParamSpec);
      }).not.to.throw();
    });

    it("should throw a error if a param value doesn't pass the validation regex", () => {
      const testParamSpec = [
        {
          param: "HI",
          label: "hello",
          validationRegex: "FAIL",
          required: true,
        },
      ];
      const testParams = {
        HI: "val",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(testParams, testParamSpec);
      }).to.throw(FirebaseError);
    });

    it("should throw a error if a multiselect value isn't an option", () => {
      const testParamSpec = [
        {
          param: "HI",
          label: "hello",
          type: extensionsApi.ParamType.MULTISELECT,
          options: [
            {
              value: "val",
            },
          ],
          required: true,
        },
      ];
      const testParams = {
        HI: "val,FAIL",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(testParams, testParamSpec);
      }).to.throw(FirebaseError);
    });

    it("should throw a error if a multiselect param is missing options", () => {
      const testParamSpec = [
        {
          param: "HI",
          label: "hello",
          type: extensionsApi.ParamType.MULTISELECT,
          options: [],
          validationRegex: "FAIL",
          required: true,
        },
      ];
      const testParams = {
        HI: "FAIL,val",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(testParams, testParamSpec);
      }).to.throw(FirebaseError);
    });

    it("should throw a error if a select param is missing options", () => {
      const testParamSpec = [
        {
          param: "HI",
          label: "hello",
          type: extensionsApi.ParamType.SELECT,
          validationRegex: "FAIL",
          options: [],
          required: true,
        },
      ];
      const testParams = {
        HI: "FAIL,val",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(testParams, testParamSpec);
      }).to.throw(FirebaseError);
    });

    it("should not throw if a select value is an option", () => {
      const testParamSpec = [
        {
          param: "HI",
          label: "hello",
          type: extensionsApi.ParamType.SELECT,
          options: [
            {
              value: "val",
            },
          ],
          required: true,
        },
      ];
      const testParams = {
        HI: "val",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(testParams, testParamSpec);
      }).not.to.throw();
    });

    it("should not throw if all multiselect values are options", () => {
      const testParamSpec = [
        {
          param: "HI",
          label: "hello",
          type: extensionsApi.ParamType.MULTISELECT,
          options: [
            {
              value: "val",
            },
            {
              value: "val2",
            },
          ],
          required: true,
        },
      ];
      const testParams = {
        HI: "val,val2",
      };

      expect(() => {
        extensionsHelper.validateCommandLineParams(testParams, testParamSpec);
      }).not.to.throw();
    });
  });

  describe("validateSpec", () => {
    it("should not error on a valid spec", () => {
      const testSpec: extensionsApi.ExtensionSpec = {
        name: "test",
        version: "0.1.0",
        specVersion: "v1beta",
        resources: [],
        params: [],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).not.to.throw();
    });
    it("should error if license is missing", () => {
      const testSpec: extensionsApi.ExtensionSpec = {
        name: "test",
        version: "0.1.0",
        specVersion: "v1beta",
        resources: [],
        params: [],
        sourceUrl: "https://test-source.fake",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /license/);
    });
    it("should error if license is invalid", () => {
      const testSpec: extensionsApi.ExtensionSpec = {
        name: "test",
        version: "0.1.0",
        specVersion: "v1beta",
        resources: [],
        params: [],
        sourceUrl: "https://test-source.fake",
        license: "invalid-license",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /license/);
    });
    it("should error if name is missing", () => {
      const testSpec = {
        version: "0.1.0",
        specVersion: "v1beta",
        resources: [],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /name/);
    });

    it("should error if specVersion is missing", () => {
      const testSpec = {
        name: "test",
        version: "0.1.0",
        resources: [],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /specVersion/);
    });

    it("should error if version is missing", () => {
      const testSpec = {
        name: "test",
        specVersion: "v1beta",
        resources: [],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /version/);
    });

    it("should error if a resource is malformed", () => {
      const testSpec = {
        version: "0.1.0",
        specVersion: "v1beta",
        resources: [{}],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /name/);
    });

    it("should error if an api is malformed", () => {
      const testSpec = {
        version: "0.1.0",
        specVersion: "v1beta",
        apis: [{}],
        resources: [],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /apiName/);
    });

    it("should error if a param is malformed", () => {
      const testSpec = {
        version: "0.1.0",
        specVersion: "v1beta",
        params: [{}],
        resources: [],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /param/);
    });

    it("should error if a STRING param has options.", () => {
      const testSpec = {
        version: "0.1.0",
        specVersion: "v1beta",
        params: [{ options: [] }],
        resources: [],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /options/);
    });

    it("should error if a select param has validationRegex.", () => {
      const testSpec = {
        version: "0.1.0",
        specVersion: "v1beta",
        params: [{ type: extensionsHelper.SpecParamType.SELECT, validationRegex: "test" }],
        resources: [],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /validationRegex/);
    });
    it("should error if a param has an invalid type.", () => {
      const testSpec = {
        version: "0.1.0",
        specVersion: "v1beta",
        params: [{ type: "test-type", validationRegex: "test" }],
        resources: [],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /Invalid type/);
    });
    it("should error if a param selectResource missing resourceType.", () => {
      const testSpec = {
        version: "0.1.0",
        specVersion: "v1beta",
        params: [
          {
            type: extensionsHelper.SpecParamType.SELECTRESOURCE,
            validationRegex: "test",
            default: "fail",
          },
        ],
        resources: [],
        sourceUrl: "https://test-source.fake",
        license: "apache-2.0",
      };

      expect(() => {
        extensionsHelper.validateSpec(testSpec);
      }).to.throw(FirebaseError, /must have resourceType/);
    });
  });

  describe("promptForValidInstanceId", () => {
    let promptStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sinon.stub(prompt, "promptOnce");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should prompt the user and return if the user provides a valid id", async () => {
      const extensionName = "extension-name";
      const userInput = "a-valid-name";
      promptStub.returns(userInput);

      const instanceId = await extensionsHelper.promptForValidInstanceId(extensionName);

      expect(instanceId).to.equal(userInput);
      expect(promptStub).to.have.been.calledOnce;
    });

    it("should prompt the user again if the provided id is shorter than 6 characters", async () => {
      const extensionName = "extension-name";
      const userInput1 = "short";
      const userInput2 = "a-valid-name";
      promptStub.onCall(0).returns(userInput1);
      promptStub.onCall(1).returns(userInput2);

      const instanceId = await extensionsHelper.promptForValidInstanceId(extensionName);

      expect(instanceId).to.equal(userInput2);
      expect(promptStub).to.have.been.calledTwice;
    });

    it("should prompt the user again if the provided id is longer than 45 characters", async () => {
      const extensionName = "extension-name";
      const userInput1 = "a-really-long-name-that-is-really-longer-than-were-ok-with";
      const userInput2 = "a-valid-name";
      promptStub.onCall(0).returns(userInput1);
      promptStub.onCall(1).returns(userInput2);

      const instanceId = await extensionsHelper.promptForValidInstanceId(extensionName);

      expect(instanceId).to.equal(userInput2);
      expect(promptStub).to.have.been.calledTwice;
    });

    it("should prompt the user again if the provided id ends in a -", async () => {
      const extensionName = "extension-name";
      const userInput1 = "invalid-";
      const userInput2 = "-invalid";
      const userInput3 = "a-valid-name";
      promptStub.onCall(0).returns(userInput1);
      promptStub.onCall(1).returns(userInput2);
      promptStub.onCall(2).returns(userInput3);

      const instanceId = await extensionsHelper.promptForValidInstanceId(extensionName);

      expect(instanceId).to.equal(userInput3);
      expect(promptStub).to.have.been.calledThrice;
    });

    it("should prompt the user again if the provided id starts with a number", async () => {
      const extensionName = "extension-name";
      const userInput1 = "1invalid";
      const userInput2 = "a-valid-name";
      promptStub.onCall(0).returns(userInput1);
      promptStub.onCall(1).returns(userInput2);

      const instanceId = await extensionsHelper.promptForValidInstanceId(extensionName);

      expect(instanceId).to.equal(userInput2);
      expect(promptStub).to.have.been.calledTwice;
    });

    it("should prompt the user again if the provided id contains illegal characters", async () => {
      const extensionName = "extension-name";
      const userInput1 = "na.name@name";
      const userInput2 = "a-valid-name";
      promptStub.onCall(0).returns(userInput1);
      promptStub.onCall(1).returns(userInput2);

      const instanceId = await extensionsHelper.promptForValidInstanceId(extensionName);

      expect(instanceId).to.equal(userInput2);
      expect(promptStub).to.have.been.calledTwice;
    });
  });

  describe("createSourceFromLocation", () => {
    let archiveStub: sinon.SinonStub;
    let uploadStub: sinon.SinonStub;
    let createSourceStub: sinon.SinonStub;
    let deleteStub: sinon.SinonStub;
    const testUrl = "https://storage.googleapis.com/firebase-ext-eap-uploads/object.zip";
    const testSource: ExtensionSource = {
      name: "test",
      packageUri: testUrl,
      hash: "abc123",
      state: "ACTIVE",
      spec: {
        name: "projects/test-proj/sources/abc123",
        version: "0.0.0",
        sourceUrl: testUrl,
        resources: [],
        params: [],
      },
    };

    beforeEach(() => {
      archiveStub = sinon.stub(archiveDirectory, "archiveDirectory").resolves({});
      uploadStub = sinon.stub(storage, "uploadObject").resolves({
        bucket: "firebase-ext-eap-uploads",
        object: "object.zip",
        generation: 42,
      });
      createSourceStub = sinon.stub(extensionsApi, "createSource").resolves(testSource);
      deleteStub = sinon.stub(storage, "deleteObject").resolves();
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should upload local sources to Firebase Storage then create an ExtensionSource", async () => {
      const result = await extensionsHelper.createSourceFromLocation("test-proj", ".");

      expect(result).to.equal(testSource);
      expect(archiveStub).to.have.been.calledWith(".");
      expect(uploadStub).to.have.been.calledWith({}, extensionsHelper.EXTENSIONS_BUCKET_NAME);
      expect(createSourceStub).to.have.been.calledWith("test-proj", testUrl + "?alt=media", "/");
      expect(deleteStub).to.have.been.calledWith(
        `/${extensionsHelper.EXTENSIONS_BUCKET_NAME}/object.zip`
      );
    });

    it("should succeed even when it fails to delete the uploaded archive", async () => {
      deleteStub.throws();

      const result = await extensionsHelper.createSourceFromLocation("test-proj", ".");

      expect(result).to.equal(testSource);
      expect(archiveStub).to.have.been.calledWith(".");
      expect(uploadStub).to.have.been.calledWith({}, extensionsHelper.EXTENSIONS_BUCKET_NAME);
      expect(createSourceStub).to.have.been.calledWith("test-proj", testUrl + "?alt=media", "/");
      expect(deleteStub).to.have.been.calledWith(
        `/${extensionsHelper.EXTENSIONS_BUCKET_NAME}/object.zip`
      );
    });

    it("should create an ExtensionSource with url sources", async () => {
      const url = "https://storage.com/my.zip";

      const result = await extensionsHelper.createSourceFromLocation("test-proj", url);

      expect(result).to.equal(testSource);
      expect(createSourceStub).to.have.been.calledWith("test-proj", url);
      expect(archiveStub).not.to.have.been.called;
      expect(uploadStub).not.to.have.been.called;
      expect(deleteStub).not.to.have.been.called;
    });

    it("should throw an error if one is thrown while uploading a local source ", async () => {
      uploadStub.throws(new FirebaseError("something bad happened"));

      await expect(extensionsHelper.createSourceFromLocation("test-proj", ".")).to.be.rejectedWith(
        FirebaseError
      );

      expect(archiveStub).to.have.been.calledWith(".");
      expect(uploadStub).to.have.been.calledWith({}, extensionsHelper.EXTENSIONS_BUCKET_NAME);
      expect(createSourceStub).not.to.have.been.called;
      expect(deleteStub).not.to.have.been.called;
    });
  });

  describe("getExtensionSourceFromName", () => {
    let resolveRegistryEntryStub: sinon.SinonStub;
    let getSourceStub: sinon.SinonStub;

    const testOnePlatformSourceName = "projects/test-proj/sources/abc123";
    const testRegistyEntry = {
      labels: { latest: "0.1.1" },
      versions: {
        "0.1.0": "projects/test-proj/sources/def456",
        "0.1.1": testOnePlatformSourceName,
      },
      publisher: "firebase",
    };
    const testSource: ExtensionSource = {
      name: "test",
      packageUri: "",
      hash: "abc123",
      state: "ACTIVE",
      spec: {
        name: "",
        version: "0.0.0",
        sourceUrl: "",
        resources: [],
        params: [],
      },
    };

    beforeEach(() => {
      resolveRegistryEntryStub = sinon
        .stub(resolveSource, "resolveRegistryEntry")
        .resolves(testRegistyEntry);
      getSourceStub = sinon.stub(extensionsApi, "getSource").resolves(testSource);
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should look up official source names in the registry and fetch the ExtensionSource found there", async () => {
      const testOfficialName = "storage-resize-images";

      const result = await extensionsHelper.getExtensionSourceFromName(testOfficialName);

      expect(resolveRegistryEntryStub).to.have.been.calledWith(testOfficialName);
      expect(getSourceStub).to.have.been.calledWith(testOnePlatformSourceName);
      expect(result).to.equal(testSource);
    });

    it("should fetch ExtensionSources when given a one platform name", async () => {
      const result = await extensionsHelper.getExtensionSourceFromName(testOnePlatformSourceName);

      expect(resolveRegistryEntryStub).not.to.have.been.called;
      expect(getSourceStub).to.have.been.calledWith(testOnePlatformSourceName);
      expect(result).to.equal(testSource);
    });

    it("should throw an error if given a invalid namae", async () => {
      await expect(extensionsHelper.getExtensionSourceFromName(".")).to.be.rejectedWith(
        FirebaseError
      );

      expect(resolveRegistryEntryStub).not.to.have.been.called;
      expect(getSourceStub).not.to.have.been.called;
    });
  });

  describe("checkIfInstanceIdAlreadyExists", () => {
    const TEST_NAME = "image-resizer";
    let getInstanceStub: sinon.SinonStub;

    beforeEach(() => {
      getInstanceStub = sinon.stub(extensionsApi, "getInstance");
    });

    afterEach(() => {
      getInstanceStub.restore();
    });

    it("should return false if no instance with that name exists", async () => {
      getInstanceStub.resolves({ error: { code: 404 } });

      const exists = await extensionsHelper.instanceIdExists("proj", TEST_NAME);
      expect(exists).to.be.false;
    });

    it("should return true if an instance with that name exists", async () => {
      getInstanceStub.resolves({ name: TEST_NAME });

      const exists = await extensionsHelper.instanceIdExists("proj", TEST_NAME);
      expect(exists).to.be.true;
    });

    it("should throw if it gets an unexpected error response from getInstance", async () => {
      getInstanceStub.resolves({ error: { code: 500, message: "a message" } });

      await expect(extensionsHelper.instanceIdExists("proj", TEST_NAME)).to.be.rejectedWith(
        FirebaseError,
        "Unexpected error when checking if instance ID exists: a message"
      );
    });
  });
});
