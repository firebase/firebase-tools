module.exports = class callableFunction {
	constructor(name, controller, https) {
		this.name = name;
		this.controller = controller;

	}
	
	call(data) {
		this.controller.call(this.name, data);
	}
};
