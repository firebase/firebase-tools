/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { expect } from "chai";
import * as sinon from "sinon";
import * as run from "../../gcp/run";
import { Client } from "../../apiv2";

describe("run", () => {
  describe("setInvokerCreate", () => {
    let sandbox: sinon.SinonSandbox;
    let apiRequestStub: sinon.SinonStub;
    let client: Client;

    beforeEach(() => {
      client = new Client({
        urlPrefix: "origin",
        auth: true,
        apiVersion: "v1",
      });
      sandbox = sinon.createSandbox();
      apiRequestStub = sandbox.stub(client, "post").throws("Unexpected API post call");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should reject on emtpy invoker array", async () => {
      await expect(run.setInvokerCreate("project", "service", [], client)).to.be.rejected;
    });

    it("should reject if the setting the IAM policy fails", async () => {
      apiRequestStub.onFirstCall().throws("Error calling set api.");

      await expect(
        run.setInvokerCreate("project", "service", ["public"], client)
      ).to.be.rejectedWith("Failed to set the IAM Policy on the Service service");
      expect(apiRequestStub).to.be.calledOnce;
    });

    it("should set a private policy on a function", async () => {
      apiRequestStub.onFirstCall().callsFake((path: string, json: any) => {
        expect(json.policy).to.deep.eq({
          bindings: [
            {
              role: "roles/run.invoker",
              members: [],
            },
          ],
          etag: "",
          version: 3,
        });

        return Promise.resolve();
      });

      await expect(run.setInvokerCreate("project", "service", ["private"], client)).to.not.be
        .rejected;
      expect(apiRequestStub).to.be.calledOnce;
    });

    it("should set a public policy on a function", async () => {
      apiRequestStub.onFirstCall().callsFake((path: string, json: any) => {
        expect(json.policy).to.deep.eq({
          bindings: [
            {
              role: "roles/run.invoker",
              members: ["allUsers"],
            },
          ],
          etag: "",
          version: 3,
        });

        return Promise.resolve();
      });

      await expect(run.setInvokerCreate("project", "service", ["public"], client)).to.not.be
        .rejected;
      expect(apiRequestStub).to.be.calledOnce;
    });

    it("should set the policy with a set of invokers with active policies", async () => {
      apiRequestStub.onFirstCall().callsFake((path: string, json: any) => {
        json.policy.bindings[0].members.sort();
        expect(json.policy.bindings[0].members).to.deep.eq([
          "serviceAccount:service-account1@project.iam.gserviceaccount.com",
          "serviceAccount:service-account2@project.iam.gserviceaccount.com",
          "serviceAccount:service-account3@project.iam.gserviceaccount.com",
        ]);

        return Promise.resolve();
      });

      await expect(
        run.setInvokerCreate(
          "project",
          "service",
          [
            "service-account1@",
            "service-account2@project.iam.gserviceaccount.com",
            "service-account3@",
          ],
          client
        )
      ).to.not.be.rejected;
      expect(apiRequestStub).to.be.calledOnce;
    });
  });

  describe("setInvokerUpdate", () => {
    describe("setInvokerCreate", () => {
      let sandbox: sinon.SinonSandbox;
      let apiPostStub: sinon.SinonStub;
      let apiGetStub: sinon.SinonStub;
      let client: Client;

      beforeEach(() => {
        client = new Client({
          urlPrefix: "origin",
          auth: true,
          apiVersion: "v1",
        });
        sandbox = sinon.createSandbox();
        apiPostStub = sandbox.stub(client, "post").throws("Unexpected API post call");
        apiGetStub = sandbox.stub(client, "get").throws("Unexpected API get call");
      });

      afterEach(() => {
        sandbox.restore();
      });

      it("should reject on emtpy invoker array", async () => {
        await expect(run.setInvokerUpdate("project", "service", [])).to.be.rejected;
      });

      it("should reject if the getting the IAM policy fails", async () => {
        apiGetStub.onFirstCall().throws("Error calling get api.");

        await expect(
          run.setInvokerUpdate("project", "service", ["public"], client)
        ).to.be.rejectedWith("Failed to get the IAM Policy on the Service service");

        expect(apiGetStub).to.be.called;
      });

      it("should reject if the setting the IAM policy fails", async () => {
        apiGetStub.resolves({ body: {} });
        apiPostStub.throws("Error calling set api.");

        await expect(
          run.setInvokerUpdate("project", "service", ["public"], client)
        ).to.be.rejectedWith("Failed to set the IAM Policy on the Service service");
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });

      it("should set a basic policy on a function without any polices", async () => {
        apiGetStub.onFirstCall().resolves({ body: {} });
        apiPostStub.onFirstCall().callsFake((path: string, json: any) => {
          expect(json.policy).to.deep.eq({
            bindings: [
              {
                role: "roles/run.invoker",
                members: ["allUsers"],
              },
            ],
            etag: "",
            version: 3,
          });

          return Promise.resolve();
        });

        await expect(run.setInvokerUpdate("project", "service", ["public"], client)).to.not.be
          .rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });

      it("should set the policy with private invoker with active policies", async () => {
        apiGetStub.onFirstCall().resolves({
          body: {
            bindings: [
              { role: "random-role", members: ["user:pineapple"] },
              { role: "roles/run.invoker", members: ["some-service-account"] },
            ],
            etag: "1234",
            version: 3,
          },
        });
        apiPostStub.onFirstCall().callsFake((path: string, json: any) => {
          expect(json.policy).to.deep.eq({
            bindings: [
              { role: "random-role", members: ["user:pineapple"] },
              { role: "roles/run.invoker", members: [] },
            ],
            etag: "1234",
            version: 3,
          });

          return Promise.resolve();
        });

        await expect(run.setInvokerUpdate("project", "service", ["private"], client)).to.not.be
          .rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });

      it("should set the policy with a set of invokers with active policies", async () => {
        apiGetStub.onFirstCall().resolves({ body: {} });
        apiPostStub.onFirstCall().callsFake((path: string, json: any) => {
          json.policy.bindings[0].members.sort();
          expect(json.policy.bindings[0].members).to.deep.eq([
            "serviceAccount:service-account1@project.iam.gserviceaccount.com",
            "serviceAccount:service-account2@project.iam.gserviceaccount.com",
            "serviceAccount:service-account3@project.iam.gserviceaccount.com",
          ]);

          return Promise.resolve();
        });

        await expect(
          run.setInvokerUpdate(
            "project",
            "service",
            [
              "service-account1@",
              "service-account2@project.iam.gserviceaccount.com",
              "service-account3@",
            ],
            client
          )
        ).to.not.be.rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });

      it("should not set the policy if the set of invokers is the same as the current invokers", async () => {
        apiGetStub.onFirstCall().resolves({
          body: {
            bindings: [
              {
                role: "roles/run.invoker",
                members: [
                  "serviceAccount:service-account1@project.iam.gserviceaccount.com",
                  "serviceAccount:service-account3@project.iam.gserviceaccount.com",
                  "serviceAccount:service-account2@project.iam.gserviceaccount.com",
                ],
              },
            ],
            etag: "1234",
            version: 3,
          },
        });

        await expect(
          run.setInvokerUpdate(
            "project",
            "service",
            [
              "service-account2@project.iam.gserviceaccount.com",
              "service-account3@",
              "service-account1@",
            ],
            client
          )
        ).to.not.be.rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.not.be.called;
      });
    });
  });
});
