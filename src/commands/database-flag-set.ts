//import { Response } from "request";
//import * as _ from "lodash";
//import * as request from "request";

//import * as responseToError from "../responseToError";
//import * as Command from "../command";
//import * as logger from "../logger";
//import * as FirebaseError from "../error";
//import * as requirePermissions from "../requirePermissions";
//import * as utils from "../utils";
//import * as api from "../api";
//import * as requireInstance from "../requireInstance";

//export default new Command("database:flag:set <path> <value>")
  //.description(
    //"fetch RTDB config stored at the given path. To view all configs, do database;config:get /"
  //)
  //.option(
    //"--instance <instance>",
    //"use the database <instance>.firebaseio.com (if omitted, use default database instance)"
  //)
  //.before(requirePermissions, ["firebasedatabase.instances.get"])
////.before(requirePermissions, ["firebasedatabase.instances.update"])
  //.before(requireInstance)
  //.action(function(path: string, options: any) {
    //return new Promise((resolve, reject) => {
      //if (!_.startsWith(path, "/")) {
        //return utils.reject("Path must begin with /", { exit: 1 });
      //}
      //const url =
        //utils.addSubdomain(api.realtimeOrigin, options.instance) + "/.settings/" + path + ".json";
      //const reqOptions = {
        //url,
      //};
      //return api.addRequestHeaders(reqOptions).then((reqOptionsWithToken) => {
        //request.put(reqOptionsWithToken, (err: Error, res: Response, body: value) => {
          //if (err) {
            //return reject(
              //new FirebaseError(`Unexpected error fetching configs at ${path}`, {
                //exit: 2,
                //original: err,
              //})
            //);
          //} else if (res.statusCode >= 400) {
            //return reject(responseToError(res, body));
          //}
          //utils.logSuccess(`Updated ${path} to ${value}`);
          //resolve();
        //});
      //});
    //});
  //});
