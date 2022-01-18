declare module "marked-terminal" {
    import marked = require("marked");

  class TerminalRenderer extends marked.Renderer {
    constructor(options?: marked.MarkedOptions);
  }

  export = TerminalRenderer;
}
