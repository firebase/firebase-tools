import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinonChai from "sinon-chai";
import process from "node:process";

chai.use(chaiAsPromised);
chai.use(sinonChai);

process.on("unhandledRejection", (error) => {
  throw error;
});
