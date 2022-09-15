// import * as clc from "colorette";
// import * as chai from "chai";
// chai.use(require("chai-as-promised"));
// import * as sinon from "sinon";

// import * as askUserForConsent from "../../extensions/askUserForConsent";
// import { Role } from "../../extensions/types";
// import * as iam from "../../gcp/iam";

// const expect = chai.expect;

// describe("askUserForConsent", () => {
//   describe("formatDescription", () => {
//     let getRoleStub: sinon.SinonStub;
//     beforeEach(() => {
//       getRoleStub = sinon.stub(iam, "getRole");
//       getRoleStub.rejects("UNDEFINED TEST BEHAVIOR");
//     });

//     afterEach(() => {
//       getRoleStub.restore();
//     });
//     const roles: Role[] = [
//       { role: "storage.objectAdmin", reason: "" },
//       { role: "datastore.viewer", reason: "" },
//     ];

//     it("format description correctly", () => {
//       const instanceId = "extension-for-test";
//       const projectId = "project-for-test";
//       const question = `${clc.bold(
//         instanceId
//       )} will be granted the following access to project ${clc.bold(projectId)}`;
//       const storageRole = {
//         title: "Storage Object Admin",
//         description: "Full control of GCS objects.",
//       };
//       const datastoreRole = {
//         title: "Cloud Datastore Viewer",
//         description: "Read access to all Cloud Datastore resources.",
//       };
//       const storageDescription = "- Storage Object Admin (Full control of GCS objects.)";
//       const datastoreDescription =
//         "- Cloud Datastore Viewer (Read access to all Cloud Datastore resources.)";
//       const expected = [question, storageDescription, datastoreDescription].join("\n");

//       getRoleStub.onFirstCall().resolves(storageRole);
//       getRoleStub.onSecondCall().resolves(datastoreRole);
//     });
//   });
// });
