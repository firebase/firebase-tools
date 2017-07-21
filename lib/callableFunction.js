'use strict';

var CallableFunction = function(name, controller) {
	this.name = name;
	this.controller = controller;
};
	
CallableFunction.prototype.call = function(data, opts) {
		// construct data.delta, etc. previous/next
		// substitute wildcards with random stuff

	this.controller.call(this.name, data || {}, opts);
};

module.exports = CallableFunction;
