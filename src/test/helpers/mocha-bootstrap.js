const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

process.on("unhandledRejection", (error) => {
  throw error;
});
