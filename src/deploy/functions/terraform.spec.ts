import { expect } from "chai";
import * as yaml from "js-yaml";
import { getFunctionsManifest } from "./export";
import * as runtimes from "./runtimes";
import * as build from "./build";
import * as sinon from "sinon";

describe("functions:export terraform", () => {
    let getRuntimeDelegateStub: sinon.SinonStub;

    beforeEach(() => {
        getRuntimeDelegateStub = sinon.stub(runtimes, "getRuntimeDelegate");
    });

    afterEach(() => {
        getRuntimeDelegateStub.restore();
    });

    it("should export terraform files correctly", async () => {
        const mockBuild: build.Build = {
            requiredAPIs: [{ api: "cloudfunctions.googleapis.com" }],
            endpoints: {
                "my-func": {
                    id: "my-func",
                    project: "my-project",
                    region: ["us-central1"],
                    entryPoint: "handler",
                    platform: "gcfv2",
                    runtime: "nodejs22",
                    environmentVariables: {
                        FOO: "BAR",
                        BAZ: "{{ params.MY_PARAM }}",
                    },
                    httpsTrigger: {},
                } as any,
            },
            params: [
                {
                    name: "MY_PARAM",
                    type: "string",
                    description: "A param",
                    default: "default-val",
                } as any,
            ],
        };

        const mockDelegate = {
            language: "nodejs",
            runtime: "nodejs22",
            validate: sinon.stub().resolves(),
            build: sinon.stub().resolves(),
            discoverBuild: sinon.stub().resolves(mockBuild),
        };

        getRuntimeDelegateStub.resolves(mockDelegate);

        const manifest = await getFunctionsManifest(
            "/source",
            "/project",
            "my-project",
            "nodejs22",
            {},
            "terraform"
        );

        expect(manifest["functions.yaml"]).to.exist;
        expect(manifest["main.tf"]).to.contain("resource \"google_project_service\" \"cloudfunctions_googleapis_com\"");
        expect(manifest["parameters.tf"]).to.contain("variable \"MY_PARAM\"");
        expect(manifest["parameters.tf"]).to.contain("default = \"default-val\"");
        expect(manifest["functions.tf"]).to.contain("resource \"google_cloudfunctions2_function\" \"my_func\"");
        expect(manifest["functions.tf"]).to.contain("BAZ = var.MY_PARAM");
    });
});
