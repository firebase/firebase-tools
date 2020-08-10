import { expect } from "chai";
import * as sinon from "sinon";
import * as api from "../../../api";
import { mockAuth } from "../../helpers";
import * as remoteconfig from "../../../remoteconfig/get";
import * as rcDeploy from "../../../deploy/remoteconfig/functions"
import { RemoteConfigTemplate } from "../../../remoteconfig/interfaces";

const release = require("../../../deploy/remoteconfig/release");
const PROJECT_NUMBER = "001";

//const etag = "123";

// Test sample template
const expectedTemplateInfo: RemoteConfigTemplate = {
    conditions: [
        {
            name: "RCTestCondition",
            expression: "dateTime < dateTime('2020-07-24T00:00:00', 'America/Los_Angeles')",
        },
    ],
    parameters: {
        RCTestkey: {
            defaultValue: {
                value: "RCTestValue",
            },
        },
    },
    version: {
        versionNumber: "7",
        updateTime: "2020-07-23T17:13:11.190Z",
        updateUser: {
            email: "abc@gmail.com",
        },
        updateOrigin: "CONSOLE",
        updateType: "INCREMENTAL_UPDATE",
    },
    parameterGroups: {
        RCTestCaseGroup: {
            parameters: {
                RCTestKey2: {
                    defaultValue: {
                        value: "RCTestValue2",
                    },
                    description: "This is a test",
                },
            },
        },
    },
    etag: "123",
};

// Test sample template with two parameters
const currentTemplate: RemoteConfigTemplate = {
    conditions: [
        {
            name: "RCTestCondition",
            expression: "dateTime < dateTime('2020-07-24T00:00:00', 'America/Los_Angeles')",
        },
    ],
    parameters: {
        RCTestkey: {
            defaultValue: {
                value: "RCTestValue",
            },
        },
    },
    version: {
        versionNumber: "6",
        updateTime: "2020-07-23T17:13:11.190Z",
        updateUser: {
            email: "abc@gmail.com",
        },
        updateOrigin: "CONSOLE",
        updateType: "INCREMENTAL_UPDATE",
    },
    parameterGroups: {
        RCTestCaseGroup: {
            parameters: {
                RCTestKey2: {
                    defaultValue: {
                        value: "RCTestValue2",
                    },
                    description: "This is a test",
                },
            },
        },
    },
    etag: "123",
};

describe("Remote Config Deploy", () => {
    let sandbox: sinon.SinonSandbox;
    let apiRequestStub: sinon.SinonStub;
    let etagStub: sinon.SinonStub;
    // cannot mock the same api twice
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        mockAuth(sandbox);
        apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
        etagStub = sandbox.stub(rcDeploy, "createEtag");
    });
    afterEach(() => {
        sandbox.restore();
    });
    
    describe("Publish the updated template", () => {
        it("should publish the latest template", async () => {
            apiRequestStub.onFirstCall().resolves({ body: expectedTemplateInfo });
            etagStub.withArgs(PROJECT_NUMBER).returns("12345");
            //etagStub.onFirstCall().resolves("123");
            const etag = await rcDeploy.createEtag(PROJECT_NUMBER);
            const RCtemplate = await rcDeploy.publishTemplate(PROJECT_NUMBER, currentTemplate);
            expect(RCtemplate).to.deep.equal(expectedTemplateInfo);
            expect(apiRequestStub).to.be.calledOnceWith(
                "PUT",
                `/v1/projects/${PROJECT_NUMBER}/remoteConfig`,
                {
                    auth: true,
                    origin: api.remoteConfigApiOrigin,
                    timeout: 30000,
                    headers: { "If-Match": etag },
                    data: {
                        conditions: currentTemplate.conditions,
                        parameters: currentTemplate.parameters,
                        parameterGroups: currentTemplate.parameterGroups,
                    },
                }
                );
            });
        });
    });