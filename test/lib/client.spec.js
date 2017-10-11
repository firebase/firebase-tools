'use strict';

var chai = require('chai');
var expect = chai.expect;
var Client = require('../../lib/client');

describe('extensible client', function() {
  it('should create a default client', function() {
    var client = Client.getInstance();
    expect(client).to.exist;

    expect(client.isExtended()).to.be.false;
    expect(client.getExtension()).to.not.exist;
  });

  it('should create an extended client', function() {
    var client = Client.getInstance();

    client.extend();
    expect(client.isExtended()).to.be.true;
    expect(client.getExtension()).to.exist;
    expect(client.getExtension().configstore).to.exist;
    expect(client.getExtension().configstore.path).to.exist;
  });

  it('should create an extended client with extra options', function() {
    var client = Client.getInstance();
    expect(client).to.exist;

    client.extend({ name: 'TestName', aTestOption: 'SomeValue' });
    expect(client.getExtension().options.name).to.equal('TestName');
    expect(client.getExtension().options.aTestOption).to.equal('SomeValue');
  });
});
