'use strict';

var chai = require('chai');
var expect = chai.expect;
chai.use(require('chai-as-promised'));

var command = require('../../commands/validate');
var path = require('path');
var FirebaseError = require('../../lib/error');
var validate = command.runner();


describe('command: validate', function() {
  it('should throw a 404 error if no firebase.json is found', function() {
    return expect(validate()).to.be.rejectedWith(FirebaseError);
  });

  it('should complete successfully if firebase.json is present', function() {
    return expect(validate({
      cwd: path.join(__dirname, '/../fixtures/valid-config')
    })).to.be.fulfilled;
  });

  it('should reject if firebase.json is present but invalid', function() {
    return expect(validate({
      cwd: path.join(__dirname, '/../fixtures/invalid-config')
    })).to.be.rejectedWith('Your document has validation errors');
  });
});
