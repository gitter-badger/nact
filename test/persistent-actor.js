/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
const chai = require('chai');
chai.should();
const { MockPersistenceEngine } = require('./mock-persistence-engine');
const { BrokenPersistenceEngine } = require('./broken-persistence-engine');
const { PartiallyBrokenPersistenceEngine } = require('./partially-broken-persistence-engine');
const { start } = require('../lib');
const { spawnPersistent, configurePersistence, PersistedEvent } = require('../lib/extensions/persistence');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const { Promise } = require('bluebird');
const delay = Promise.delay;

// Begin helpers
const ignore = () => {};

const retry = async (assertion, remainingAttempts, retryInterval = 0) => {
  if (remainingAttempts <= 1) {
    return assertion();
  } else {
    try {
      assertion();
    } catch (e) {
      await delay(retryInterval);
      await retry(assertion, remainingAttempts - 1, retryInterval);
    }
  }
};

const concatenativeFunction = (initialState, additionalActions = ignore) =>
  async function (state = initialState, msg) {
    this.dispatch(this.sender, state + msg);
    await Promise.resolve(additionalActions(state, msg, this));
    return state + msg;
  };

// End helpers

describe('#persistence', () => {
  it('should disallow persistence engines which do not inherit from AbstractPersistenceEngine', function () {
    (() => configurePersistence(0)({})).should.throw(Error);
    (() => configurePersistence('1')({})).should.throw(Error);
    (() => configurePersistence(Symbol('AbstractPersistenceEngine'))({})).should.throw(Error);
    (() => configurePersistence([])({})).should.throw(Error);
    (() => configurePersistence({})({})).should.throw(Error);
    (() => configurePersistence({ events: ignore, persist: ignore })({})).should.throw(Error);
  });
});

describe('PersistentActor', () => {
  let system;

  afterEach(function () {
    // reset console
    delete console.error;
    system && system.stop();
  });

  it('should startup normally if no previous events', async function () {
    const persistenceEngine = new MockPersistenceEngine();
    system = start(configurePersistence(persistenceEngine));
    const actor = spawnPersistent(
      system,
      concatenativeFunction(''),
      'test'
    );
    actor.dispatch('a');
    actor.dispatch('b');
    (await actor.query('c')).should.equal('abc');
  });

  it('must have a persistentKey of type string', async () => {
    const persistenceEngine = new MockPersistenceEngine();
    system = start(configurePersistence(persistenceEngine));
    (() => spawnPersistent(system, ignore, undefined)).should.throw(Error);
    (() => spawnPersistent(system, ignore, null)).should.throw(Error);
    (() => spawnPersistent(system, ignore, 1)).should.throw(Error);
    (() => spawnPersistent(system, ignore, [])).should.throw(Error);
    (() => spawnPersistent(system, ignore, {})).should.throw(Error);
    (() => spawnPersistent(system, ignore, Symbol('A'))).should.throw(Error);
  });

  it('should be able to replay previously persisted events on startup', async () => {
    const expectedResult = '1234567890';
    const events = [...expectedResult].map((evt, i) => new PersistedEvent(evt, i + 1, 'test'));
    const persistenceEngine = new MockPersistenceEngine({ test: events });
    system = start(configurePersistence(persistenceEngine));
    const actor = spawnPersistent(
        system,
        concatenativeFunction(''),
        'test'
      );
    actor.dispatch('1');
    actor.dispatch('2');
    actor.dispatch('3');
    (await actor.query('')).should.equal(expectedResult + '123');
  });

  it('should be able to persist events', async () => {
    const persistenceEngine = new MockPersistenceEngine();
    system = start(configurePersistence(persistenceEngine));
    const actor = spawnPersistent(
        system,
        concatenativeFunction('', (state, msg, ctx) => !ctx.recovering && ctx.persist(msg)),
        'test'
      );
    actor.dispatch('a');
    actor.dispatch('b');
    actor.dispatch('c');
    (await actor.query('d')).should.equal('abcd');
    persistenceEngine._events.get('test').map(x => x.data).should.deep.equal(['a', 'b', 'c', 'd']);
  });

  it('should signal an error if creating restore stream fails', async () => {
    console.error = ignore;
    const persistenceEngine = new BrokenPersistenceEngine();
    system = start(configurePersistence(persistenceEngine));
    const actor = spawnPersistent(
        system,
        concatenativeFunction(''),
        'test'
      );
    await retry(() => actor.isStopped().should.be.true, 5, 10);
  });

  it('should signal an error if restore stream fails midway through recovery', async () => {
    console.error = ignore;
    const expectedResult = 'icelandiscold';
    const events = [...expectedResult].map((evt, i) => new PersistedEvent(evt, i + 1, 'frog'));
    const persistenceEngine = new PartiallyBrokenPersistenceEngine({ frog: events }, 5);
    system = start(configurePersistence(persistenceEngine));
    const actor = spawnPersistent(
      system,
      concatenativeFunction(''),
      'frog'
    );
    await retry(() => actor.isStopped().should.be.true, 5, 10);
  });
});
