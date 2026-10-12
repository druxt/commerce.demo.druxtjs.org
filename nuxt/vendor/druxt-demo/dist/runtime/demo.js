import Vue from 'vue'

const STORAGE_KEY = 'druxt-demo:overlay'
const OVERLAY_CLASS = 'druxt-demo-overlay'

let current = null

const storage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch (e) {
    return null
  }
}

const applyOverlay = (demo) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(OVERLAY_CLASS, !!demo.overlay)
}

/**
 * The demo layer's state: one reactive object every component reads.
 *
 * The plugin passes the application's Vue. A package installed through a
 * `file:` link can resolve a second copy of Vue from its own node_modules,
 * and an observable made by that copy is invisible to the application's
 * reactivity, so this file's own import is only the fallback for tests.
 *
 * @param {object} options - The module options the plugin was given.
 * @param {object} [vue] - The application's Vue constructor.
 * @returns {object} The reactive demo object.
 */
export const createDemo = (options = {}, vue = Vue) => {
  const store = storage()
  const demo = vue.observable({
    overlay: store ? store.getItem(STORAGE_KEY) === '1' : false,
    // The browser starts from what the server requested for this page.
    requests: Array.isArray(options.requests) ? [...options.requests] : [],
    session: '',
    source: options.source || '',
    docs: options.docs || '',
    discord: options.discord || '',
    notice: options.notice || '',
    reset: options.reset || null,
  })
  demo.toggleOverlay = () => {
    demo.overlay = !demo.overlay
    if (store) store.setItem(STORAGE_KEY, demo.overlay ? '1' : '0')
    applyOverlay(demo)
  }
  demo.setSession = (code) => {
    demo.session = String(code || '')
  }
  current = demo
  applyOverlay(demo)
  return demo
}

/** The demo object the plugin created. */
export const useDruxtDemo = () => current

/**
 * The path a request was made to, with its query and without its token.
 * The origin is dropped: it is Drupal's, and on a server it is an internal
 * hostname that has no place on a public page.
 *
 * @param {object} config - An axios request config.
 * @returns {string} The path and query.
 */
export const cleanUrl = (config = {}) => {
  const url = String(config.url || '').replace(/^https?:\/\/[^/]+/, '')
  return url.replace(/([?&])access_token=[^&]*&?/, '$1').replace(/[?&]$/, '')
}

/**
 * Record every request the Druxt client makes, as facts a note can show.
 * Headers are never read: an entry has the fields it has and no more.
 *
 * @param {object} axios - The axios instance.
 * @param {object} demo - The demo object.
 * @param {object} [settings] - `max`, how many entries to keep, and `where`
 *   the requests are made, `browser` or `server`.
 */
export const attachRequestLog = (
  axios,
  demo,
  { max = 50, where = 'browser' } = {}
) => {
  // In place, never replaced: the server hands the array itself to the Nuxt
  // payload before the page's fetch hooks run, and it is serialized after.
  const record = (config, response) => {
    const headers = (response || {}).headers || {}
    if (demo.requests.length >= max) {
      demo.requests.splice(0, demo.requests.length - max + 1)
    }
    demo.requests.push({
      method: String(config.method || 'get').toUpperCase(),
      url: cleanUrl(config),
      status: (response || {}).status || 0,
      ms: Date.now() - (config.druxtDemoStart || Date.now()),
      // Drupal's page cache answers anonymous requests, its dynamic page
      // cache the rest. One header or the other says which happened.
      cache:
        headers['x-drupal-cache'] || headers['x-drupal-dynamic-cache'] || '',
      where,
      at: Date.now(),
    })
  }
  axios.interceptors.request.use((config) => {
    config.druxtDemoStart = Date.now()
    return config
  })
  axios.interceptors.response.use(
    (response) => {
      record(response.config, response)
      return response
    },
    (error) => {
      if (error && error.config) record(error.config, error.response)
      return Promise.reject(error)
    }
  )
}

/**
 * Tag every mounted Druxt module component, so the overlay's CSS can outline
 * and label it. Nothing here touches server-rendered markup.
 *
 * @param {object} vue - The Vue constructor to install the mixin on.
 * @param {object} demo - The demo object.
 */
export const installOverlay = (vue, demo) => {
  const tag = (vm) => {
    if (!vm.$options.druxt || !vm.$el || vm.$el.nodeType !== 1) return
    vm.$el.setAttribute('data-druxt', vm.$options.name || 'DruxtModule')
  }
  vue.mixin({
    mounted() {
      tag(this)
    },
    updated() {
      tag(this)
    },
  })
  applyOverlay(demo)
}
