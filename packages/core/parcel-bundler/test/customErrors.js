const assert = require('assert');
const customErrors = require('../src/utils/customErrors');

const port = 1234;

const EACCES = new Error();
EACCES.code = 'EACCES';
const EADDRINUSE = new Error();
EADDRINUSE.code = 'EADDRINUSE';

describe('customErrors', () => {
  test('should include port in server errors', () => {
    const msg = customErrors.serverErrors(EACCES, port);
    assert(msg.includes(port));
  });

  test('should handle known server errors', () => {
    let msg = customErrors.serverErrors(EACCES, port);
    assert(msg.includes(`don't have access`));

    msg = customErrors.serverErrors(EADDRINUSE, port);
    assert(msg.includes('already'));
  });

  test('should handled unknown server errors', () => {
    let msg = customErrors.serverErrors(new Error(), port);
    assert(msg.includes(port));
  });
});
