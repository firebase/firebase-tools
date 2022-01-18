declare module "marked-terminal" {
  import marked from "marked";

  class TerminalRenderer extends marked.Renderer {
    constructor(options?: marked.MarkedOptions);
  }

  export = TerminalRenderer;
}
