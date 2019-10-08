declare module "marked-terminal" {
  import * as marked from "marked";

  class TerminalRenderer extends marked.Renderer {
    constructor(options?: marked.MarkedOptions);
  }

  export = TerminalRenderer;
}
