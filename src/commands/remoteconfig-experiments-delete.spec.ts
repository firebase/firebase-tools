import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./remoteconfig-experiments-delete";
import * as projectUtils from "../projectUtils";
import * as prompt from "../prompt";
import * as getMod from "../remoteconfig/getExperiment";
import * as deleteMod from "../remoteconfig/deleteExperiment";
import { logger } from "../logger";
import { FirebaseError } from "../error";

const PROJECT_NUMBER = "123456789";
const ID = "1";

describe("remoteconfig:experiments:delete", () => {
  let deleteStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(projectUtils, "needProjectNumber").resolves(PROJECT_NUMBER);
    sinon
      .stub(getMod, "getExperiment")
      .resolves({} as Awaited<ReturnType<typeof getMod.getExperiment>>);
    sinon.stub(getMod, "parseExperiment").returns("table");
    sinon.stub(logger, "info");
    deleteStub = sinon.stub(deleteMod, "deleteExperiment").resolves("deleted");
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
  });

  afterEach(() => sinon.restore());

  it("registers a -f, --force option", () => {
    const flags = (command as unknown as { options: string[][] }).options.map((o) => o[0]);
    expect(flags).to.include("-f, --force");
  });

  it("deletes after interactive confirmation", async () => {
    await command.runner()(ID, { project: "p", interactive: true });
    expect(confirmStub).to.have.been.calledOnce;
    expect(deleteStub).to.have.been.calledWith(PROJECT_NUMBER, "firebase", ID);
  });

  it("passes --force through to confirm and deletes in non-interactive mode", async () => {
    await command.runner()(ID, { project: "p", force: true, nonInteractive: true });
    expect(confirmStub).to.have.been.calledWithMatch({ force: true, nonInteractive: true });
    expect(deleteStub).to.have.been.calledOnce;
  });

  it("throws instead of silently no-oping in non-interactive mode without --force", async () => {
    await expect(command.runner()(ID, { project: "p", nonInteractive: true })).to.be.rejectedWith(
      FirebaseError,
      /--force/,
    );
    expect(confirmStub).to.not.have.been.called;
    expect(deleteStub).to.not.have.been.called;
  });

  it("does not delete when confirmation is declined", async () => {
    confirmStub.resolves(false);
    await command.runner()(ID, { project: "p", interactive: true });
    expect(deleteStub).to.not.have.been.called;
  });
});
