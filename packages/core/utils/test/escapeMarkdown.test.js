import assert from 'assert';

import {escapeMarkdown} from '../src/';

describe('escapeMarkdown', () => {
  test('returns an escaped string 01', () => {
    assert.equal('\\*test\\*', escapeMarkdown('*test*'));
  });

  test('returns an escaped string 02', () => {
    assert.equal('\\_test\\_', escapeMarkdown('_test_'));
  });

  test('returns an escaped string 03', () => {
    assert.equal('\\~test\\~', escapeMarkdown('~test~'));
  });

  test('returns an escaped string 04', () => {
    assert.equal('\\*\\_\\~test\\~\\_\\*', escapeMarkdown('*_~test~_*'));
  });

  test('returns an escaped string with backslash 01', () => {
    assert.equal('\\\\test\\\\', escapeMarkdown('\\test\\'));
  });

  test('returns an escaped string with backslash 02', () => {
    assert.equal('\\\\\\*test\\*\\\\', escapeMarkdown('\\*test*\\'));
  });
});
