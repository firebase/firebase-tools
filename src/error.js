// interface FirebaseErrorOptions {
//   children?: any[];
//   status?: number;
//   exit?: number;
//   original?: Error;
//   context?: any;
// }
//
// export default class FirebaseToolsError extends Error {
//   children: any[];
//   status: number;
//   exit: number;
//   original: any;
//   context: any;
//
//   constructor(public message: string, options: FirebaseErrorOptions) {
//     super(message);
//     options = options || {};
//
//     this.name = "FirebaseError";
//     this.message = message;
//     this.children = options.children || [];
//     this.status = options.status || 500;
//     this.exit = options.exit || 1;
//     this.stack = new Error().stack;
//     this.original = options.original;
//     this.context = options.context;
//   }
// }

"use strict";

var FirebaseError = function(message, options) {
  options = options || {};

  this.name = "FirebaseError";
  this.message = message;
  this.children = options.children || [];
  this.status = options.status || 500;
  this.exit = options.exit || 1;
  this.stack = new Error().stack;
  this.original = options.original;
  this.context = options.context;
};
FirebaseError.prototype = Object.create(Error.prototype);

module.exports = FirebaseError;
