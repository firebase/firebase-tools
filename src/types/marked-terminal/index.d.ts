declare module "marked-terminal" {
  // `marked` is an ES module, needs to be imported as such:
  import marked = require("marked");

  class TerminalRenderer extends marked.Renderer {
    constructor(options?: marked.MarkedOptions);
  }

  export = TerminalRenderer;
}
