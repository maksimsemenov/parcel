import assert from 'assert';
import sinon from 'sinon';
import path from 'path';
import {
  assertBundleTree,
  bundle,
  bundler,
  nextBundle,
} from '@parcel/test-utils';

describe.skip('bundler', function() {
  test('should bundle once before exporting middleware', async () => {
    let b = bundler(
      path.join(__dirname, '/integration/bundler-middleware/index.js'),
    );
    b.middleware();

    await nextBundle(b);
    assert(b.entryAssets);
  });

  test('should defer bundling if a bundle is pending', async () => {
    const b = bundler(path.join(__dirname, '/integration/html/index.html'));
    b.pending = true; // bundle in progress
    const spy = sinon.spy(b, 'bundle');

    // first bundle, with existing bundle pending
    const bundlePromise = b.bundle();

    // simulate bundle finished
    b.pending = false;
    b.emit('buildEnd');

    // wait for bundle to complete
    await bundlePromise;

    assert(spy.calledTwice);
  });

  test('should enforce asset type path to be a string', () => {
    const b = bundler(path.join(__dirname, '/integration/html/index.html'));

    assert.throws(() => {
      b.addAssetType('.ext', {});
    }, 'should be a module path');
  });

  test('should enforce setup before bundling', () => {
    const b = bundler(path.join(__dirname, '/integration/html/index.html'));
    b.farm = true; // truthy

    assert.throws(() => {
      b.addAssetType('.ext', __filename);
    }, 'before bundling');

    assert.throws(() => {
      b.addPackager('type', 'packager');
    }, 'before bundling');
  });

  test('should support multiple entry points', async () => {
    let b = await bundle([
      path.join(__dirname, '/integration/multi-entry/one.html'),
      path.join(__dirname, '/integration/multi-entry/two.html'),
    ]);

    await assertBundleTree(b, [
      {
        type: 'html',
        assets: ['one.html'],
        childBundles: [
          {
            type: 'js',
            assets: ['shared.js'],
          },
        ],
      },
      {
        type: 'html',
        assets: ['two.html'],
        childBundles: [],
      },
    ]);
  });

  test('should support multiple entry points as a glob', async () => {
    let b = await bundle(
      path.join(__dirname, '/integration/multi-entry/*.html'),
    );

    await assertBundleTree(b, [
      {
        type: 'html',
        assets: ['one.html'],
        childBundles: [
          {
            type: 'js',
            assets: ['shared.js'],
          },
        ],
      },
      {
        type: 'html',
        assets: ['two.html'],
        childBundles: [],
      },
    ]);
  });
});
