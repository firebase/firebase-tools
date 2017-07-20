module.exports = class callableFunction {
	constructor(name, controller, https) {
		this.name = name;
		this.controller = controller;

	}
	
	call(data, opts) {
		// construct data.delta, etc. previous/next
		// substitute wildcards with random stuff

		this.controller.call(this.name, data || {}, opts);
	}
};
