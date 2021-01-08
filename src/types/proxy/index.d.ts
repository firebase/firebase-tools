declare module "proxy" {
  import { Server } from "http";

  function SetupFunction(server: Server): Server;

  export = SetupFunction;
}
