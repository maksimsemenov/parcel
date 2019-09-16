// @flow strict-local

import type {Asset, Bundle} from '@parcel/types';

import invariant from 'assert';
import {Bundler} from '@parcel/plugin';
import {md5FromString} from '@parcel/utils';
import nullthrows from 'nullthrows';

const OPTIONS = {
  minBundles: 1,
  minBundleSize: 30000,
  maxParallelRequests: 5
};

export default new Bundler({
  // RULES:
  // 1. If dep.isAsync or dep.isEntry, start a new bundle group.
  // 2. If an asset is a different type than the current bundle, make a parallel bundle in the same bundle group.
  // 3. If an asset is already in a parent bundle in the same entry point, exclude from child bundles.
  // 4. If an asset is only in separate isolated entry points (e.g. workers, different HTML pages), duplicate it.
  // 5. If the sub-graph from an asset is >= 30kb, and the number of parallel requests in the bundle group is < 5, create a new bundle containing the sub-graph.
  // 6. If two assets are always seen together, put them in the same extracted bundle

  bundle({bundleGraph}) {
    // Step 1: create bundles for each of the explicit code split points.
    bundleGraph.traverse((node, context) => {
      if (node.type !== 'dependency') {
        return {
          ...context,
          parentNode: node
        };
      }

      let dependency = node.value;
      let assets = bundleGraph.getDependencyAssets(dependency);

      let parentBundle;
      if (context && context.parentNode.type === 'asset') {
        parentBundle = context.bundleByType.get(context.parentNode.value.type);
      }

      if (dependency.isEntry || dependency.isAsync) {
        let bundleGroup = bundleGraph.createBundleGroup(
          dependency,
          nullthrows(dependency.target ?? context?.bundleGroup?.target),
          parentBundle
        );

        let bundleByType = new Map<string, Bundle>();
        for (let asset of assets) {
          let bundle = bundleGraph.createBundle({
            entryAsset: dependency.isAsync && !dependency.isURL ? null : asset,
            id: asset.id,
            type: asset.type,
            env: asset.env,
            isEntry: asset.isIsolated ? false : Boolean(dependency.isEntry),
            target: bundleGroup.target
          });
          bundleGraph.addBundleToBundleGroup(bundle, bundleGroup);
          if (dependency.isAsync) {
            bundleGraph.addAssetToBundle(asset, bundle);
            bundleGraph.createAssetReference(dependency, asset);
          }
          bundleByType.set(bundle.type, bundle);
        }

        return {
          bundleGroup,
          bundleGroupDependency: dependency,
          bundleByType,
          parentNode: node
        };
      }

      invariant(context != null);
      for (let asset of assets) {
        if (asset.isIsolated) {
          let bundleGroup = bundleGraph.createBundleGroup(
            dependency,
            context.bundleGroup.target,
            parentBundle
          );
          let bundle = bundleGraph.createBundle({
            entryAsset: asset,
            target: context.bundleGroup.target
          });
          bundleGraph.addBundleToBundleGroup(bundle, bundleGroup);
          bundleGraph.createAssetReference(dependency, asset);
        } else {
          invariant(context.parentNode.type === 'asset');
          let parentAsset = context.parentNode.value;
          if (parentAsset.type === asset.type) {
            continue;
          }

          let existingBundle = context.bundleByType.get(asset.type);
          let bundle;
          if (existingBundle) {
            bundle = existingBundle;
          } else {
            bundle = bundleGraph.createBundle({
              entryAsset: asset,
              target: context.bundleGroup.target,
              isEntry: context.bundleGroupDependency.isEntry
            });
            bundleGraph.addBundleToBundleGroup(bundle, context.bundleGroup);
            context.bundleByType.set(bundle.type, bundle);
          }
          bundleGraph.addAssetToBundle(asset, bundle);
          bundleGraph.createAssetReference(dependency, asset);
        }
      }

      return {
        ...context,
        parentNode: node
      };
    });
  },

  optimize({bundleGraph}) {
    // Step 2: remove assets that are duplicated in a parent bundle
    bundleGraph.traverseBundles({
      exit(bundle) {
        if (bundle.env.isIsolated()) {
          // If a bundle's environment is isolated, it can't access assets present
          // in any ancestor bundles. Don't deduplicate any assets.
          return;
        }

        bundle.traverse(node => {
          if (node.type !== 'dependency') {
            return;
          }

          let dependency = node.value;
          let assets = bundleGraph.getDependencyAssets(dependency);

          for (let asset of assets) {
            if (bundleGraph.isAssetInAncestorBundles(bundle, asset)) {
              bundleGraph.removeAssetGraphFromBundle(asset, bundle);
            }
          }
        });
      }
    });

    // Step 3: Find duplicated assets in different bundle groups, and separate them into their own parallel bundles.
    // If multiple assets are always seen together in the same bundles, combine them together.
    let candidateBundles: Map<
      string,
      {|
        assets: Array<Asset>,
        sourceBundles: Set<Bundle>,
        size: number
      |}
    > = new Map();

    bundleGraph.traverseContents((node, ctx, actions) => {
      if (node.type !== 'asset') {
        return;
      }

      let asset = node.value;
      if (asset.env.isIsolated()) {
        // If an asset's environment is isolated, it can't load shared bundles.
        // Don't add this asset to a shared bundle.
        return;
      }

      let containingBundles = bundleGraph
        .findBundlesWithAsset(asset)
        // Don't create shared bundles from entry bundles, as that would require
        // another entry bundle depending on these conditions, making it difficult
        // to predict and reference.
        .filter(b => !b.isEntry);

      if (containingBundles.length > OPTIONS.minBundles) {
        let id = containingBundles
          .map(b => b.id)
          .sort()
          .join(':');

        let candidate = candidateBundles.get(id);
        if (candidate) {
          candidate.assets.push(asset);
          candidate.size += bundleGraph.getTotalSize(asset, containingBundles);
        } else {
          candidateBundles.set(id, {
            assets: [asset],
            sourceBundles: new Set(containingBundles),
            size: bundleGraph.getTotalSize(asset, containingBundles)
          });
        }

        // Skip children from consideration since we added a parent already.
        actions.skipChildren();
      }
    });

    // Sort candidates by size (consider larger bundles first), and ensure they meet the size threshold
    let sortedCandidates: Array<{|
      assets: Array<Asset>,
      sourceBundles: Set<Bundle>,
      size: number
    |}> = Array.from(candidateBundles.values())
      .filter(bundle => bundle.size >= OPTIONS.minBundleSize)
      .sort((a, b) => b.size - a.size);

    for (let {assets, sourceBundles} of sortedCandidates) {
      // Find all bundle groups connected to the original bundles
      let bundleGroups = new Set();

      for (let bundle of sourceBundles) {
        for (let bundleGroup of bundleGraph.getBundleGroupsContainingBundle(
          bundle
        )) {
          bundleGroups.add(bundleGroup);
        }
      }

      // Check that all the bundle groups are inside the parallel request limit.
      if (
        Array.from(bundleGroups).some(
          group =>
            bundleGraph.getBundlesInBundleGroup(group).length >=
            OPTIONS.maxParallelRequests
        )
      ) {
        continue;
      }

      let [firstBundle] = [...sourceBundles];
      let sharedBundle = bundleGraph.createBundle({
        id: md5FromString([...sourceBundles].map(b => b.id).join(':')),
        env: firstBundle.env,
        target: firstBundle.target,
        type: firstBundle.type
      });

      require('fs').appendFileSync('/tmp/parcelshared', sharedBundle.id + '\n');

      // Remove all of the root assets from each of the original bundles
      for (let asset of assets) {
        bundleGraph.addAssetGraphToBundle(
          asset,
          sharedBundle,
          Array.from(sourceBundles)
        );
        for (let bundle of sourceBundles) {
          bundleGraph.removeAssetGraphFromBundle(asset, bundle);
        }
      }

      // Create new bundle node and connect it to all of the original bundle groups
      for (let bundleGroup of bundleGroups) {
        bundleGraph.addBundleToBundleGroup(sharedBundle, bundleGroup);
      }
    }
  }
});
