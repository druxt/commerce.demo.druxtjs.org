# druxt-admin, the path test only

`proxy.js` and `lib/admin.js` are copied unchanged from `@druxt-contrib/admin`,
as druxtjs.org carries them, until it is released. The storefront uses only
`shouldProxy()`, which says which paths are Drupal's. The proxying itself is
the `@nuxtjs/proxy` entry in `nuxt.config.js`.
