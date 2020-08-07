// import { RemoteConfigTemplate } from "../../remoteconfig/interfaces"
// import sinon = require("sinon");
// import { mockAuth } from "../helpers";
// import api = require("../../api");
// import * as remoteconfig from "../../remoteconfig/rollback";
// import { expect } from "chai";

// const PROJECT_ID = "the-remoteconfig-test-project";

// function createTemplate(versionNumber: string, date: string, rollbackSource?: string): RemoteConfigTemplate {
//   return {
//     parameterGroups: {
//       crash_when_settings_toggled_ios: {
//         parameters: {
//           crash_when_settings_toggled_verbose_logging_ios: {
//             defaultValue: {
//               value: "false"
//             }, 
//             description: "iOS: Enable verbose logging for test crash"
//           }
//         }
//       }
//     }, 
//     version: {
//       updateUser: {
//         email: "jackiechu@google.com"
//       }, 
//       updateTime: "2020-08-07T01:55:16.663Z", 
//       description: "Rollback to version 115", 
//       updateType: "ROLLBACK", 
//       updateOrigin: "REST_API", 
//       versionNumber: versionNumber,
//       rollbackSource: rollbackSource
//     }, 
//     conditions: [
//       {
//         expression: "device.os == 'ios'", 
//         name: "abcd"
//       }
//     ], 
//     parameters: {
//       another_number: {
//         defaultValue: {
//           value: "115"
//         },
//       }, 
//     },
//     etag: "123",
//   };
// }

// const previousTemplate: RemoteConfigTemplate = {
//   return createTemplate("115", "2020-08-06T23:11:41.629Z");
// };


// describe("RemoteConfig Rollback", () => {
//   let sandbox: sinon.SinonSandbox;
//   let apiRequestStub: sinon.SinonStub;

//   beforeEach(() => {
//     sandbox = sinon.createSandbox();
//     mockAuth(sandbox);
//     apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
//   });

//   afterEach(() => {
//     sandbox.restore();
//   });

//   describe("rollbackCurrentVersion", () => {
//     it("should return a rollback to the previous version specified", async () => {
//       apiRequestStub.onFirstCall().resolves({ body: previousTemplate });

//       const RCtemplate = await remoteconfig.rollbackTemplate(PROJECT_ID, 115);

//       expect(RCtemplate).to.deep.equal(previousTemplate);
//       expect(apiRequestStub).to.be.calledOnceWith(
//         "POST",
//         `/v1/projects/${PROJECT_ID}/remoteConfig:rollback?versionNumber=` + 115,
//         {
//           auth: true,
//           origin: api.remoteConfigApiOrigin,
//           timeout: 30000,
//         }
//       );
//     });

//     it("should reject if the api call fails", async () => {
//       const expectedError = new Error("HTTP Error 404: Not Found");
//       apiRequestStub.onFirstCall().rejects(expectedError);

//       let err;
//       try {
//         await remoteconfig.rollbackTemplate(PROJECT_ID);
//       } catch (e) {
//         err = e;
//       }

//       expect(err.message).to.equal(
//         `Failed to rollback Remote Config template for Firebase project ${PROJECT_ID}. `
//       );
//       expect(err.original).to.equal(expectedError);
//       expect(apiRequestStub).to.be.calledOnceWith(
//         "POST",
//         `/v1/projects/${PROJECT_ID}/remoteConfig:rollback`,
//         {
//           auth: true,
//           origin: api.remoteConfigApiOrigin,
//           timeout: 30000,
//         }
//       );
//     });
//   });
// });