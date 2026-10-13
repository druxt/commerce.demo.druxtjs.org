# Patches

Applied to `node_modules` by `patch-package`, which runs from this package's
`postinstall` script.

## druxt-site+0.15.0-dev.20261011015353.patch

`druxt-site` ships its Nuxt module and its browser code in one bundle, and the
module imported Node's `fs` at the top level for a build-time `layouts/` check.
Webpack then tried to resolve `fs` for the browser and the client build failed
with `This dependency was not found: fs`.

The patch takes `fs` from the Nuxt resolver at call time, which is the fix in
[druxt.js#859](https://github.com/druxt/druxt.js/pull/859).

The 0.15.0 dev build from the npm `dev` channel still imports `fs` at the top,
so the patch is rerolled against it. **Remove this patch** once the frontend
moves to a `druxt-site` build that contains that fix. `patch-package` fails loudly when the package version
changes, so an upgrade will not carry it silently.
