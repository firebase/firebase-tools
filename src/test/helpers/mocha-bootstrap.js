const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const sinonChai = require("sinon-chai");

chai.use(chaiAsPromised);
chai.use(sinonChai);

process.on("unhandledRejection", (error) => {
  throw error;
});
