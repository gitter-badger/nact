/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
const chai = require('chai');
const should = chai.should();
const { start, spawnStateless, spawn } = require('../lib');
const { LocalPath } = require('../lib/paths');

const ignore = () => {};

describe('System', function () {
  describe('#spawn()', function () {
    let system;
    beforeEach(() => { system = start(); });
    afterEach(() => system.stop());

    it('should prevent a child with the same name from being spawned', function () {
      spawnStateless(system, () => console.log('hello'), 'child1');
      (() => spawnStateless(system, () => console.log('hello'), 'child1')).should.throw(Error);
    });
  });

  describe('#tryFindActorFromPath()', function () {
    let system;
    beforeEach(() => { system = start(); });
    afterEach(() => system.stop());

    it('should correctly resolve existing actor from a LocalPath', function () {
      let child1 = spawnStateless(system, ignore, 'child1');
      let child2 = spawnStateless(child1, ignore, 'child2');
      let child3 = spawnStateless(child2, ignore, 'child3');
      system.tryFindActorFromPath(new LocalPath(['child1', 'child2', 'child3'])).should.equal(child3);
    });

    it('should return undefined if the actor at the given path does not exist', function () {
      let child1 = spawnStateless(system, ignore, 'child1');
      let child2 = spawnStateless(child1, ignore, 'child2');
      spawnStateless(child2, ignore, 'child3');
      should.not.exist(system.tryFindActorFromPath(new LocalPath(['child1', 'child2', 'child3', 'child4'])));
    });

    it('should throw a TypeError if the path is not of a supported type', function () {
      let child1 = spawnStateless(system, ignore, 'child1');
      let child2 = spawnStateless(child1, ignore, 'child2');
      spawnStateless(child2, ignore, 'child3');
      (() => system.tryFindActorFromPath({ localParts: ['child1', 'child2', 'child3', 'child4'] })).should.throw(TypeError);
    });
  });

  describe('#stop()', function () {
    let system;
    beforeEach(() => { system = start(); });
    afterEach(() => system.stop());

    it('should prevent children from being spawned after being called', function () {
      system.stop();
      (() => spawnStateless(system, () => console.log('spawning'))).should.throw(Error);
      (() => spawn(system, ignore)).should.throw(Error);
    });

    it('should register as being stopped', function () {
      system.stop();
      system.isStopped().should.be.true;
    });
  });
});
