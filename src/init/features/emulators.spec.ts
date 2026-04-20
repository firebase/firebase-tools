import { expect } from "chai";
import * as sinon from "sinon";
import { doSetup } from "./emulators";
import * as prompt from "../../prompt";
import * as downloadableEmulators from "../../emulator/downloadableEmulators";
import { Emulators } from "../../emulator/types";
import { Config } from "../../config";
import { Setup } from "../index";

describe("init/features/emulators", () => {
  let checkboxStub: sinon.SinonStub;
  let numberStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;
  let downloadStub: sinon.SinonStub;

  beforeEach(() => {
    checkboxStub = sinon.stub(prompt, "checkbox");
    numberStub = sinon.stub(prompt, "number");
    confirmStub = sinon.stub(prompt, "confirm");
    downloadStub = sinon.stub(downloadableEmulators, "downloadIfNecessary").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should do nothing if no emulators are selected", async () => {
    checkboxStub.resolves([]);
    const setup = { config: {} } as unknown as Setup;
    const config = new Config({}, {});

    await doSetup(setup, config);

    expect(setup.config.emulators).to.deep.equal({ singleProjectMode: true });
  });

  it("should configure selected emulators with default ports", async () => {
    checkboxStub.resolves([Emulators.FIRESTORE, Emulators.DATABASE]);
    numberStub.onFirstCall().resolves(8080);
    numberStub.onSecondCall().resolves(9000);
    confirmStub.onFirstCall().resolves(false); // UI
    confirmStub.onSecondCall().resolves(false); // Download

    const setup = { config: {} } as unknown as Setup;
    const config = new Config({}, {});

    await doSetup(setup, config);

    expect(setup.config.emulators.firestore.port).to.equal(8080);
    expect(setup.config.emulators.database.port).to.equal(9000);
  });

  it("should prompt for UI enablement and port", async () => {
    checkboxStub.resolves([Emulators.FIRESTORE]);
    numberStub.onFirstCall().resolves(8080); // Firestore port
    confirmStub.onFirstCall().resolves(true); // Enable UI
    numberStub.onSecondCall().resolves(4000); // UI port
    confirmStub.onSecondCall().resolves(false); // Download

    const setup = { config: {} } as unknown as Setup;
    const config = new Config({}, {});

    await doSetup(setup, config);

    expect(setup.config.emulators.ui.enabled).to.be.true;
    expect(setup.config.emulators.ui.port).to.equal(4000);
  });

  it("should download emulators if requested", async () => {
    checkboxStub.resolves([Emulators.FIRESTORE]);
    numberStub.resolves(8080);
    confirmStub.onFirstCall().resolves(false); // UI
    confirmStub.onSecondCall().resolves(true); // Download

    const setup = { config: {} } as unknown as Setup;
    const config = new Config({}, {});

    await doSetup(setup, config);

    expect(downloadStub).to.have.been.calledWith(Emulators.FIRESTORE);
  });
});
