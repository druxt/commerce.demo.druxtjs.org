require('dotenv').config({ path: '../.env' })
// Visitors' names on the live socket, drawn from the shop rather than the
// sockets package's own pool.
const { nameFor } = require('./server/live/names.js')
const { SITE_DESCRIPTION, liveOrigin, siteOrigin } = require('./lib/site')

const baseUrl = process.env.BASE_URL || ''

// Which paths are Drupal's screens; the production server uses the same test.
const { isDrupalScreen } = require('./lib/drupal-paths')


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
  publicRuntimeConfig: {
    // Where the live socket opens, when not on the page's own host: read when
    // each page generates, so a reused build still names it.
    socketsOrigin: liveOrigin(),
    // The origin the head names in canonical links and share tags.
    siteOrigin: siteOrigin(),
  },

  head: {
    titleTemplate: (chunk) => (chunk ? `${chunk} · Druxt Store` : 'Druxt Store'),
    htmlAttrs: {
      lang: 'en'
    },
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'description', name: 'description', content: SITE_DESCRIPTION },
      { name: 'format-detection', content: 'telephone=no' }
    ],
    link: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      // llms.txt discovery (https://llmstxt.org): every page points at the
      // index and the full text beside it. The server sends the same as a
      // Link header.
      { rel: 'describedby', type: 'text/markdown', href: '/llms.txt' },
      { rel: 'describedby', type: 'text/markdown', href: '/llms-full.txt' },
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
    // Drupal's Preview button renders the unsaved node here, at
    // /druxt/node/preview, from the JSON:API Node Preview document whose path
    // it is handed in the URL fragment. Before druxt-site, as on druxtjs.org.
    '@druxt-contrib/node-preview',
    'druxt-site',
    // The demo layer: bar, notes, overlay. After druxt-site, so the Druxt
    // client exists when the plugin attaches its request log.
    '@druxt/demo',
    // The live socket: open pages hear Drupal's purges, and the storefront's
    // own channels (demo sessions, orders, who is looking) run on it. It
    // attaches under `nuxt dev`; server/start.js attaches it in production.
    '@druxt-contrib/sockets',
    localhostListenURL,
    // Last: it puts the storefront's page on the router's route, which
    // druxt-site adds. It also writes robots.txt, sitemap.xml, llms.txt and
    // llms-full.txt into the export.
    '~/modules/seo-files',
  ],

  sockets: {
    path: '/_live',
    server: process.env.NODE_ENV !== 'production',
    handlers: '~/server/live/handlers.js',
    secret: process.env.DRUXT_SOCKETS_SECRET,
    // Visitors get shop names, not the package's food ones.
    name: nameFor,
  },

  // The demo layer's links and notice. Styled here by UnoCSS, so the
  // module's own stylesheet stays out.
  druxtDemo: {
    source: 'https://github.com/druxt/commerce.demo.druxtjs.org',
    docs: 'https://druxtjs.org',
    notice: 'A demo. Carts and orders are real in Drupal, no money moves, and the daily reset wipes them.',
    css: false,
  },

  // Drupal's login, admin and edit screens on this origin, so an editor's
  // session is first party. The Host is kept, so Drupal builds its links and
  // redirects for this origin; its cookies lose their Domain, and Secure on
  // plain HTTP, where a browser would not store them.
  proxy: [
    // JSON:API and path lookups keep the visitor's Host too, ahead of Druxt's
    // own entries, which change it. Drupal names its session cookie after the
    // host, so a changed one reads an editor as signed out and a preview 404s.
    ...['/jsonapi', '/router/translate-path'].map((context) => [context, { target: baseUrl, changeOrigin: false }]),
    [
      isDrupalScreen,
      {
        target: baseUrl,
        changeOrigin: false,
        cookieDomainRewrite: '',
        onProxyRes: (proxyRes, req) => {
          const https = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || req.socket.encrypted
          const cookies = proxyRes.headers['set-cookie']
          if (https || !cookies) return
          proxyRes.headers['set-cookie'] = cookies.map((cookie) => cookie.replace(/;\s*secure/gi, ''))
        },
      },
    ],
  ],

  // DruxtJS: https://druxtjs.org
  druxt: {
    baseUrl,
    // Disable deprecated Entity fields.
    entity: { components: { fields: false }},
    // Proxy JSON:API through Nuxt, so the client uses relative URLs and
    // its requests stay same-origin rather than needing CORS.
    proxy: { api: true },
    // No include: the module adds one list to every bundle's preview, and a
    // field another bundle lacks fails the request. The article view reads
    // its image and tags itself. The layouts are the ones the preview's
    // Layout picker may switch the frame to: the page alone, which a preview
    // opens on, or the store around it.
    nodePreview: {
      layouts: ['preview', 'default'],
    },
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
