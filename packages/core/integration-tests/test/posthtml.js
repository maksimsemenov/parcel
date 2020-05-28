import assert from 'assert';
import {
  bundle,
  assertBundles,
  removeDistDirectory,
  distDir,
  outputFS,
} from '@parcel/test-utils';
import path from 'path';

describe('posthtml', () => {
  afterEach(async () => {
    await removeDistDirectory();
  });

  test('should support transforming HTML with posthtml', async () => {
    let b = await bundle(
      path.join(__dirname, '/integration/posthtml/index.html'),
    );

    assertBundles(b, [
      {
        name: 'index.html',
        assets: ['index.html'],
      },
    ]);

    let html = await outputFS.readFile(path.join(distDir, 'index.html'));
    assert(html.includes('<h1>Other page</h1>'));
  });

  test('should find assets inside posthtml', async () => {
    let b = await bundle(
      path.join(__dirname, '/integration/posthtml-assets/index.html'),
    );

    assertBundles(b, [
      {
        type: 'html',
        assets: ['index.html'],
      },
      {
        type: 'js',
        assets: ['index.js'],
      },
    ]);
  });

  test.skip('should add dependencies referenced by posthtml-include', async () => {
    const b = await bundle(
      path.join(__dirname, '/integration/posthtml-assets/index.html'),
    );
    const asset = b.assets.values().next().value;
    const other = path.join(
      __dirname,
      '/integration/posthtml-assets/other.html',
    );
    assert(asset.dependencies.has(other));
    assert(asset.dependencies.get(other).includedInParent);
  });

  test.skip('should add dependencies referenced by plugins', async () => {
    const b = await bundle(
      path.join(__dirname, '/integration/posthtml-plugin-deps/index.html'),
    );
    const asset = b.assets.values().next().value;
    const other = path.join(
      __dirname,
      '/integration/posthtml-plugin-deps/base.html',
    );
    assert(asset.dependencies.has(other));
    assert(asset.dependencies.get(other).includedInParent);
  });
});
