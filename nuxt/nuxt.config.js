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
    localhostListenURL,
  ],

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
