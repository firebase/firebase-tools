var FirebaseError = function(message, options) {
  this.name = 'FirebaseError';
  this.message = message;
  this.children = options.children || [];
  this.stack = (new Error()).stack;
}
FirebaseError.prototype = Object.create(Error.prototype);

module.exports = FirebaseError;
