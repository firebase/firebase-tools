'use strict';

var chai = require('chai');
var expect = chai.expect;

var lifecycleHooks = require('../../lib/deploy/lifecycleHooks');

describe('checkNPMCommands', function() {
	var checkCommands = lifecycleHooks.checkCommands;
	it('should remove empty and missing scripts', function() {
		var JSON = {
			'name': 'functions',
			'scripts': {
				'test1': 'echo \'Hello World \'',
				'test2': ''
			}
		};

		var testCommands = [
			'npm --prefix $RESOURCE_DIR run test1',
			'npm --prefix $RESOURCE_DIR run test2',
			'npm run test3'
		];

		var results = [
			'npm --prefix $RESOURCE_DIR run test1'
		];
		return expect(checkCommands(testCommands, JSON)).to.deep.equal(results);
	});
});
