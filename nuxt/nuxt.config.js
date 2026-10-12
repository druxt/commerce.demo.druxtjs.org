require('dotenv').config({ path: '../.env' })

const baseUrl = process.env.BASE_URL || ''


// Bound to 0.0.0.0, Nuxt reports the container-internal interface IP as
// its listen URL - unreachable from the host. Rewrite the reported URL
// only: the bind stays 0.0.0.0 so container port forwarding keeps working.
const localhostListenURL = function () {
  this.nuxt.hook('listen', (server, listener) => {
    listener.host = 'localhost'
    listener.url = `http://localhost:${listener.port}/`
  })
}

// The words the shop URL uses for collection and brand terms, read once at
// config time: a demo's terms do not change between builds. A parent
// collection maps to itself and its children joined with `+`, which the
// view's argument reads as OR.
const slug = (name) =>
  name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const termAliases = async (vocabulary, tree = false) => {
  try {
    const url = `${baseUrl}/jsonapi/taxonomy_term/${vocabulary}?fields[taxonomy_term--${vocabulary}]=name,drupal_internal__tid,parent&page[limit]=50`
    const res = await fetch(url, { headers: { Accept: 'application/vnd.api+json' } })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const { data } = await res.json()
    const tid = (t) => String(t.attributes.drupal_internal__tid)
    const parentOf = (t) => ((t.relationships.parent || {}).data || [])[0] || {}
    return Object.fromEntries(
      data.map((t) => {
        const children = tree ? data.filter((c) => parentOf(c).id === t.id).map(tid) : []
        return [slug(t.attributes.name), [tid(t), ...children].join('+')]
      })
    )
  } catch (e) {
    // The build goes on, but the shop's slugs for these terms will not resolve.
    console.warn(`termAliases: no ${vocabulary} aliases from ${baseUrl}: ${e.message}`)
    return {}
  }
}

export default async () => ({
  // Generated, then served by server/start.js with Drupal's paths proxied on
  // the same origin. The cart, checkout and catalogue filters run in the
  // browser against JSON:API, so a static build loses nothing.
  target: 'static',

  generate: {
    // The start script builds beside the served copy, then swaps it in.
    dir: process.env.GENERATE_DIR || 'dist',
    // Builds sit beside the source, so the change check skips them: one
    // counted as a source change would rebuild webpack for every content
    // change instead of only rendering the pages again.
    cache: { ignore: ['dist-*/**', 'dist/**'] },
  },

  // Nuxt 2 defaults to binding 'localhost' (loopback only), which is not
  // reachable through devcontainer/DevPod port forwarding - the forwarded
  // port maps to the container's network interface, not its loopback.
  // https://v2.nuxt.com/docs/configuration-glossary/configuration-server/
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: process.env.PORT || 3000
  },

  // Global page headers: https://go.nuxtjs.dev/config-head
  head: {
    titleTemplate: (chunk) => (chunk ? `${chunk} · Druxt Store` : 'Druxt Store'),
    htmlAttrs: {
      lang: 'en'
    },
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'description', name: 'description', content: 'A Drupal Commerce Kickstart store, served by Nuxt via Druxt.' },
      { name: 'format-detection', content: 'telephone=no' }
    ],
    link: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
    ]
  },

  router: {
    // Drupal's product listing lives at /products, and Kickstart's own hero
    // links there. The storefront has one catalogue, so both names reach it.
    extendRoutes(routes) {
      routes.unshift({ path: '/products', redirect: '/catalogue' })
    },
  },

  // Global CSS: https://go.nuxtjs.dev/config-css
  css: [
    // Belgrade-derived structural utilities for the Bootstrap class names
    // Drupal's Layout Builder serves as data. First, so the design's own
    // utilities win wherever the two vocabularies collide.
    '~/assets/css/belgrade-layout.css',
    '~/assets/css/uno.css',
    '~/assets/css/fonts.css',
    '~/assets/css/base.css',
  ],

  // Plugins to run before rendering page: https://go.nuxtjs.dev/config-plugins
  plugins: [
    // The live layer: demo sessions, order rooms and who is looking. Browser
    // only, since it is all about this visitor's socket.
    '~/plugins/live.client.js',
  ],

  // Auto import components: https://go.nuxtjs.dev/config-components
  components: true,

  // Modules for dev and build (recommended): https://go.nuxtjs.dev/config-modules
  buildModules: [
    // Renders Drupal Layout Builder sections. The Kickstart front page is a
    // Layout Builder node, so without this it renders as an empty element.
  ],

  // Modules: https://go.nuxtjs.dev/config-modules
  modules: [
    'druxt-site',
    // The demo layer: bar, notes, overlay. After druxt-site, so the Druxt
    // client exists when the plugin attaches its request log.
    '@druxt/demo',
    // The live socket: open pages hear Drupal's purges, and the storefront's
    // own channels (demo sessions, orders, who is looking) run on it. It
    // attaches under `nuxt dev`; server/start.js attaches it in production.
    '@druxt-contrib/sockets',
    localhostListenURL,
  ],

  publicRuntimeConfig: {
    // Where the live socket opens when not on the page's own host: on Lagoon
    // the `app.` route, around the CDN, which drops WebSockets.
    socketsOrigin: process.env.SOCKETS_ORIGIN || '',
  },

  sockets: {
    path: '/_live',
    server: process.env.NODE_ENV !== 'production',
    handlers: '~/server/live/handlers.js',
    secret: process.env.DRUXT_SOCKETS_SECRET,
  },

  // The demo layer's links and notice. Styled here by UnoCSS, so the
  // module's own stylesheet stays out.
  druxtDemo: {
    source: 'https://github.com/druxt/commerce.demo.druxtjs.org',
    docs: 'https://druxtjs.org',
    notice: 'A demo. Carts and orders are real in Drupal, no money moves, and the daily reset wipes them.',
    css: false,
  },

  // DruxtJS: https://druxtjs.org
  druxt: {
    baseUrl,
    // Disable deprecated Entity fields.
    entity: { components: { fields: false }},
    // Proxy JSON:API through Nuxt, so the client uses relative URLs and
    // its requests stay same-origin rather than needing CORS.
    proxy: { api: true },
    // The site's actual theme. Asking for one the site does not use returns an
    // empty region set, which renders no header, navigation or footer at all.
    site: { theme: 'belgrade' },
    // The shop: a Views page whose URL is its state (the views pages
    // prototype vendored under vendor/druxt-views). The collection is the
    // view's contextual argument in the path, the brand an exposed filter in
    // the query, and sort and page follow.
    views: {
      pages: {
        // Filters in the path, not the query: /shop/women/centarro+centorium.
        // An empty collection before a brand is written as `all`.
        '/shop/:collection?/:brand?': {
          viewId: 'products',
          displayId: 'page_1',
          arguments: ['collection'],
          filters: { brand: { param: 'brand', multiple: true } },
          page: 'page',
          sort: 'sort',
          history: 'replace',
          aliases: {
            collection: await termAliases('product_collections', true),
            brand: await termAliases('product_brands'),
          },
        },
      },
    },
  },

  // Build Configuration: https://go.nuxtjs.dev/config-build
  build: {
    // UnoCSS, configured in uno.config.js, applied through PostCSS.
    // `@unocss/nuxt` targets Nuxt 3 and puts ESM into the Nuxt 2 server
    // bundle, which Node cannot parse. `@unocss/webpack` exposes a virtual
    // `uno.css` module that Nuxt 2's template compiler cannot resolve from
    // `css[]`. The PostCSS plugin needs neither: it processes the `@unocss`
    // directive in a real stylesheet.
    postcss: {
      plugins: {
        '@unocss/postcss': {},
      },
    },
  }
})
