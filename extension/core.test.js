'use strict';

const assert = require('node:assert/strict');
const core = require('./core');

assert.equal(core.normalize('  ciao\n  mondo  '), 'ciao mondo');
assert.equal(core.isMetaText('merc 08:15'), true);
assert.equal(core.isMetaText('Sono interessato alla preparazione fisica'), false);
assert.equal(core.asAiText([
  { sender: 'me', text: 'Ciao' },
  { sender: 'user', text: 'Buongiorno' }
]), 'IO: Ciao\nUTENTE: Buongiorno');
assert.deepEqual(core.dedupeMessages([
  { sender: 'me', text: 'Ciao', top: 10 },
  { sender: 'me', text: 'Ciao', top: 15 },
  { sender: 'user', text: 'Ciao', top: 20 }
]), [
  { sender: 'me', text: 'Ciao', top: 10 },
  { sender: 'user', text: 'Ciao', top: 20 }
]);

console.log('core tests: OK');

