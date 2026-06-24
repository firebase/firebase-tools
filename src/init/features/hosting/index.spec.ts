import { expect } from "chai";
import * as sinon from "sinon";
import * as prompt from "../../../prompt";
import * as config from "../../../config";
import * as getDefaultHostingSiteMod from "../../../getDefaultHostingSite";
import * as hostingInteractive from "../../../hosting/interactive";
import * as hostingApi from "../../../hosting/api";
import * as frameworks from "../../../frameworks";
import { Client } from "../../../apiv2";
import { askQuestions, actuate } from "./index";
import { Setup } from "../..";
import * as github from "./github";

describe("hosting feature init", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("askQuestions", () => {
    it("should prompt for public directory and spa", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

      sandbox.stub(frameworks, "discover").resolves(undefined);
      // Mock existing site check
      sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite").resolves("test-site");

      const inputStub = sandbox.stub(prompt, "input").resolves("public");
      const confirmStub = sandbox.stub(prompt, "confirm").resolves(false);
      sandbox.stub(github, "initGitHub").resolves();

      await askQuestions(setup, cfg, {
        cwd: "/",
        configPath: "",
        only: "",
        except: "",
        nonInteractive: false,
      } as any);

      expect(
        inputStub.calledWith(
          sinon.match({ message: "What do you want to use as your public directory?" }),
        ),
      ).to.be.true;
      expect(
        confirmStub.calledWith(
          sinon.match("Configure as a single-page app (rewrite all urls to /index.html)?"),
        ),
      ).to.be.true;

      expect(setup.featureInfo?.hosting).to.deep.include({
        public: "public",
        spa: false,
      });
    });

    it("should prompt to create a site if none exists", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

      sandbox.stub(frameworks, "discover").resolves(undefined);
      sandbox
        .stub(getDefaultHostingSiteMod, "getDefaultHostingSite")
        .rejects(getDefaultHostingSiteMod.errNoDefaultSite);
      sandbox.stub(prompt, "confirm").resolves(true);
      const pickSiteStub = sandbox
        .stub(hostingInteractive, "pickHostingSiteName")
        .resolves("new-site-id");
      sandbox.stub(prompt, "input").resolves("public");
      sandbox.stub(github, "initGitHub").resolves();

      await askQuestions(setup, cfg, {
        cwd: "/",
        configPath: "",
        only: "",
        except: "",
        nonInteractive: false,
      } as any);

      expect(pickSiteStub.called).to.be.true;
      expect(setup.featureInfo?.hosting?.newSiteId).to.equal("new-site-id");
    });

    describe("App Hosting supported frameworks", () => {
      for (const framework of ["next", "angular", "nuxt", "nuxt2", "express", "svelekit"]) {
        it(`${framework}: should redirect to App Hosting when user accepts`, async () => {
          const setup: Setup = {
            config: {},
            rcfile: { projects: {}, targets: {}, etags: {} },
            projectId: "demo-project",
            instructions: [],
            features: [],
          };
          const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

          sandbox.stub(frameworks, "discover").resolves({ framework, mayWantBackend: true });
          sandbox.stub(prompt, "confirm").resolves(true);
          const inputStub = sandbox.stub(prompt, "input");
          sandbox.stub(github, "initGitHub").resolves();

          await askQuestions(setup, cfg, {
            cwd: "/",
            configPath: "",
            only: "",
            except: "",
            nonInteractive: false,
          } as any);

          expect(setup.features).to.deep.equal(["apphosting"]);
          expect(setup.featureInfo?.hosting).to.deep.equal({ redirectToAppHosting: true });
          expect(inputStub.called).to.be.false;
        });

        it(`${framework}: should continue hosting init when user declines`, async () => {
          const setup: Setup = {
            config: {},
            rcfile: { projects: {}, targets: {}, etags: {} },
            projectId: "demo-project",
            instructions: [],
            features: [],
          };
          const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

          sandbox.stub(frameworks, "discover").resolves({ framework, mayWantBackend: true });
          sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite").resolves("test-site");
          sandbox.stub(prompt, "confirm").resolves(false);
          const inputStub = sandbox.stub(prompt, "input").resolves("public");
          sandbox.stub(github, "initGitHub").resolves();

          await askQuestions(setup, cfg, {
            cwd: "/",
            configPath: "",
            only: "",
            except: "",
            nonInteractive: false,
          } as any);

          expect(setup.features).to.deep.equal([]);
          expect(
            inputStub.calledWith(
              sinon.match({ message: "What do you want to use as your public directory?" }),
            ),
          ).to.be.true;
        });
      }
    });

    describe("App Hosting unsupported frameworks", () => {
      for (const framework of ["vite", "astro"]) {
        it(`${framework}: should throw when user declines to continue with Hosting`, async () => {
          const setup: Setup = {
            config: {},
            rcfile: { projects: {}, targets: {}, etags: {} },
            projectId: "demo-project",
            instructions: [],
            features: [],
          };
          const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

          sandbox.stub(frameworks, "discover").resolves({ framework, mayWantBackend: true });
          sandbox.stub(prompt, "confirm").resolves(false);
          const inputStub = sandbox.stub(prompt, "input");

          await expect(
            askQuestions(setup, cfg, {
              cwd: "/",
              configPath: "",
              only: "",
              except: "",
              nonInteractive: false,
            } as any),
          ).to.be.rejectedWith(/Hosting initialization cancelled/);

          expect(inputStub.called).to.be.false;
        });

        it(`${framework}: should continue hosting init when user accepts`, async () => {
          const setup: Setup = {
            config: {},
            rcfile: { projects: {}, targets: {}, etags: {} },
            projectId: "demo-project",
            instructions: [],
            features: [],
          };
          const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

          sandbox.stub(frameworks, "discover").resolves({ framework, mayWantBackend: true });
          sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite").resolves("test-site");
          sandbox.stub(prompt, "confirm").resolves(true);
          const inputStub = sandbox.stub(prompt, "input").resolves("public");
          sandbox.stub(github, "initGitHub").resolves();

          await askQuestions(setup, cfg, {
            cwd: "/",
            configPath: "",
            only: "",
            except: "",
            nonInteractive: false,
          } as any);

          expect(
            inputStub.calledWith(
              sinon.match({ message: "What do you want to use as your public directory?" }),
            ),
          ).to.be.true;
        });
      }
    });

    describe("static or undetected frameworks", () => {
      it("should proceed normally when no framework is detected", async () => {
        const setup: Setup = {
          config: {},
          rcfile: { projects: {}, targets: {}, etags: {} },
          projectId: "demo-project",
          instructions: [],
          features: [],
        };
        const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

        sandbox.stub(frameworks, "discover").resolves(undefined);
        sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite").resolves("test-site");

        sandbox.stub(prompt, "confirm").resolves(false);
        const inputStub = sandbox.stub(prompt, "input").resolves("public");
        sandbox.stub(github, "initGitHub").resolves();

        await askQuestions(setup, cfg, {
          cwd: "/",
          configPath: "",
          only: "",
          except: "",
          nonInteractive: false,
        } as any);

        expect(
          inputStub.calledWith(
            sinon.match({ message: "What do you want to use as your public directory?" }),
          ),
        ).to.be.true;
      });

      it("should proceed normally for static frameworks like Flutter", async () => {
        const setup: Setup = {
          config: {},
          rcfile: { projects: {}, targets: {}, etags: {} },
          projectId: "demo-project",
          instructions: [],
          features: [],
        };
        const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

        sandbox
          .stub(frameworks, "discover")
          .resolves({ framework: "flutter", mayWantBackend: false });
        sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite").resolves("test-site");

        sandbox.stub(prompt, "confirm").resolves(false);
        const inputStub = sandbox.stub(prompt, "input").resolves("public");
        sandbox.stub(github, "initGitHub").resolves();

        await askQuestions(setup, cfg, {
          cwd: "/",
          configPath: "",
          only: "",
          except: "",
          nonInteractive: false,
        } as any);

        expect(
          inputStub.calledWith(
            sinon.match({ message: "What do you want to use as your public directory?" }),
          ),
        ).to.be.true;
      });

      it("should proceed normally when framework has no backend", async () => {
        const setup: Setup = {
          config: {},
          rcfile: { projects: {}, targets: {}, etags: {} },
          projectId: "demo-project",
          instructions: [],
          features: [],
        };
        const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

        sandbox
          .stub(frameworks, "discover")
          .resolves({ framework: "nextjs", mayWantBackend: false });
        sandbox.stub(getDefaultHostingSiteMod, "getDefaultHostingSite").resolves("test-site");

        sandbox.stub(prompt, "confirm").resolves(false);
        const inputStub = sandbox.stub(prompt, "input").resolves("public");
        sandbox.stub(github, "initGitHub").resolves();

        await askQuestions(setup, cfg, {
          cwd: "/",
          configPath: "",
          only: "",
          except: "",
          nonInteractive: false,
        } as any);

        expect(
          inputStub.calledWith(
            sinon.match({ message: "What do you want to use as your public directory?" }),
          ),
        ).to.be.true;
      });
    });
  });

  describe("actuate", () => {
    it("should throw when hosting info is missing", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });

      await expect(
        actuate(setup, cfg, {
          cwd: "/",
          configPath: "",
          only: "",
          except: "",
          nonInteractive: false,
        } as any),
      ).to.be.rejectedWith(/Could not find hosting info/);
    });

    it("should be a no-op when hosting was redirected to apphosting", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        featureInfo: { hosting: { redirectToAppHosting: true } },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const askWriteStub = sandbox.stub(cfg, "askWriteProjectFile").resolves();

      await actuate(setup, cfg, {
        cwd: "/",
        configPath: "",
        only: "",
        except: "",
        nonInteractive: false,
      } as any);

      expect(askWriteStub.called).to.be.false;
    });

    it("should write 404.html and index.html for non-SPA", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        featureInfo: {
          hosting: {
            public: "public",
            spa: false,
          },
        },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const askWriteStub = sandbox.stub(cfg, "askWriteProjectFile").resolves();

      const clientStub = sandbox.stub(Client.prototype, "get").resolves({
        body: { current: { version: "1.2.3" } },
        status: 200,
        response: {} as any,
      });

      await actuate(setup, cfg, {
        cwd: "/",
        configPath: "",
        only: "",
        except: "",
        nonInteractive: false,
      } as any);

      expect(askWriteStub.calledTwice).to.be.true;
      expect(askWriteStub.firstCall.args[0]).to.equal("public/404.html");
      expect(askWriteStub.secondCall.args[0]).to.equal("public/index.html");
      expect(clientStub.calledWith("/firebasejs/releases.json")).to.be.true;
    });

    it("should configure rewrites for SPA", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        featureInfo: {
          hosting: {
            public: "public",
            spa: true,
          },
        },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const askWriteStub = sandbox.stub(cfg, "askWriteProjectFile").resolves();
      sandbox.stub(Client.prototype, "get").resolves({
        body: { current: { version: "1.2.3" } },
        status: 200,
        response: {} as any,
      });

      await actuate(setup, cfg, {
        cwd: "/",
        configPath: "",
        only: "",
        except: "",
        nonInteractive: false,
      } as any);

      expect(setup.config.hosting).to.deep.include({
        rewrites: [{ source: "**", destination: "/index.html" }],
      });
      expect(askWriteStub.calledOnce).to.be.true; // Only index.html
    });

    it("should create site if newSiteId is present", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        featureInfo: {
          hosting: {
            public: "public",
            spa: false,
            newSiteId: "new-site",
          },
        },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      sandbox.stub(cfg, "askWriteProjectFile").resolves();
      sandbox.stub(Client.prototype, "get").resolves({
        body: { current: { version: "1.2.3" } },
        status: 200,
        response: {} as any,
      });
      const createSiteStub = sandbox.stub(hostingApi, "createSite").resolves({
        name: "new-site",
        defaultUrl: "https://new-site.web.app",
        type: hostingApi.SiteType.DEFAULT_SITE,
        appId: "app-id",
        labels: {},
      });

      await actuate(setup, cfg, {
        cwd: "/",
        configPath: "",
        only: "",
        except: "",
        nonInteractive: false,
      } as any);

      expect(createSiteStub.calledWith("test-project", "new-site")).to.be.true;
    });
  });
}).timeout(5000);
