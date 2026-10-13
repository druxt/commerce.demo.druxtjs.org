# Vendored: @druxt-contrib/sockets

A built copy of the module, carried until it is published.

| | |
| --- | --- |
| Source | The module's `feature/sockets` branch, with `name`, `describe` and `rolesClaim` |
| Changed | `dist/runtime/client.js` opens the socket on the `origin` option or the public runtime config's `socketsOrigin` when one is set, the same change the Umami demo carries, so production's socket can go around a CDN that drops WebSockets |
