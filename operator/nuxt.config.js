// The operator console: every view is a signed-in view, so nothing is
// rendered on the server. Drupal's paths are proxied on this origin, by
// Druxt's proxy under `nuxt dev` and by server/start.js in production, so
// the console needs no CORS of its own.
const storefront = (process.env.STOREFRONT_ORIGIN || 'http://127.0.0.1:18962').replace(/\/+$/, '')

export default {
  ssr: false,
  target: 'server',
  // Nuxt's telemetry module wants a newer consola than Nuxt 2's bundler can
  // parse in the browser, and the console has nothing to report anyway.
  telemetry: false,

  server: {
    host: process.env.HOST || '0.0.0.0',
    port: process.env.PORT || 3001,
  },

  head: {
    titleTemplate: (chunk) => (chunk ? `${chunk} · Operator console` : 'Operator console'),
    htmlAttrs: { lang: 'en' },
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'robots', content: 'noindex' },
    ],
    link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
  },

  css: ['~/assets/css/uno.css', '~/assets/css/base.css'],

  plugins: ['~/plugins/session.client.js'],

  components: true,

  // PostCSS 8 for Nuxt 2.15, which the UnoCSS plugin needs.
  buildModules: ['@nuxt/postcss8'],

  modules: [
    '@nuxtjs/axios',
    // Sign-in on the console's own consumer. The password grant is made by a
    // server route, the module's under `nuxt dev` and server/start.js's in
    // production, never by the browser.
    ['druxt-auth', { clientId: process.env.OAUTH_CLIENT_ID || 'commerce_operator' }],
    // The storefront's hub is the one socket: this app runs none of its own.
    '@druxt-contrib/sockets',
    // Drupal's paths on this origin under `nuxt dev`; server/start.js does
    // it in production. Not the Druxt module: that reads Drupal's index at
    // build time, and the console builds where no Drupal is.
    '@nuxtjs/proxy',
  ],

  // What druxt-auth reads: where Drupal is, and that its routes are proxied,
  // so the browser's token and userinfo calls stay on this origin.
  druxt: {
    baseUrl: process.env.BASE_URL || 'http://127.0.0.1:18961',
    proxy: { api: true },
  },

  proxy: {
    '/jsonapi': process.env.BASE_URL || 'http://127.0.0.1:18961',
    '/oauth/debug': process.env.BASE_URL || 'http://127.0.0.1:18961',
  },

  auth: {
    // The sign-in page sends the operator on itself, once the role check
    // has run, so a refused account never bounces through two routes.
    redirect: { login: '/login', logout: '/login', home: false, callback: false },
    strategies: {
      'drupal-password': {
        endpoints: {
          login: { baseURL: '', url: '/_auth/drupal-password/token' },
          refresh: { baseURL: '', url: '/_auth/drupal-password/token' },
          user: { url: '/oauth/userinfo', method: 'post' },
        },
      },
    },
  },

  router: {
    middleware: ['auth', 'operator'],
  },

  publicRuntimeConfig: {
    // Where visitors go, and where the hub answers. Session links point here.
    storefront,
    socketsOrigin: process.env.SOCKETS_ORIGIN || storefront,
  },

  sockets: {
    path: '/_live',
    server: false,
    refresh: false,
  },

  build: {
    postcss: {
      plugins: {
        '@unocss/postcss': {},
      },
    },
  },
}
