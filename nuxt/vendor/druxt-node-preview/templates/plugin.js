/**
 * The $druxtNodePreview plugin.
 *
 * Fetches a JSON:API Node Preview document with the editor's Drupal session,
 * and seeds the Druxt store with it so DruxtEntity renders the unsaved data.
 *
 * It also registers the `druxtNodePreview` store module. Its `active` state is
 * true while a preview is seeded, so a site component that refetches its data
 * (for example paragraphs at a revision) can skip that and read the store.
 *
 * Leaving the preview route flushes the seeded resources from the Druxt store
 * and clears `active`, so the next page renders the saved content.
 */
export default ({ app, store }, inject) => {
  const include = JSON.parse('<%= JSON.stringify(options.include) %>')
  const layouts = JSON.parse('<%= JSON.stringify(options.layouts) %>')

  // The type and id of every resource the preview put in the Druxt store.
  const seeded = []

  if (!store.hasModule('druxtNodePreview')) {
    store.registerModule('druxtNodePreview', {
      namespaced: true,
      state: () => ({ active: false, uuid: null }),
      mutations: {
        start(state, uuid) {
          state.active = true
          state.uuid = uuid
        },
        stop(state) {
          state.active = false
          state.uuid = null
        },
      },
    }, { preserveState: !!(store.state || {}).druxtNodePreview })
  }

  // Before the next route loads, so none of its components read a seeded
  // resource. Druxt then fetches the saved one.
  if (app.router) {
    app.router.beforeEach((to, from, next) => {
      if (from.name === 'druxt-node-preview' && to.name !== 'druxt-node-preview' && seeded.length) {
        for (const { type, id } of seeded.splice(0)) {
          store.commit('druxt/flushResource', { type, id })
        }
        store.commit('druxtNodePreview/stop')
      }
      next()
    })
  }

  /**
   * Adds the configured includes to the include the URL already has.
   *
   * Consumer Node Preview already includes a node's paragraphs. A site adds
   * what those paragraphs reference, such as their media.
   *
   * @param {string} url - The endpoint.
   *
   * @returns {string} The URL to request.
   */
  const withInclude = (url) => {
    if (!include.length) return url
    const [base, query = ''] = url.split('?')
    const params = query.split('&').filter((param) => param && !param.startsWith('include='))
    const current = (query.split('&').find((param) => param.startsWith('include=')) || 'include=')
      .slice('include='.length)
      .split(',')
      .filter(Boolean)
    const merged = [...new Set([...current, ...include])]
    return base + '?' + [...params, 'include=' + merged.join(',')].join('&')
  }

  /**
   * Builds an error that carries the status and the start of the body.
   *
   * @param {string} url - The requested URL.
   * @param {number} status - The HTTP status.
   * @param {string} body - The response body.
   *
   * @returns {Error} The error.
   */
  const failure = (url, status, body) => new Error(
    'Preview request failed with HTTP ' + status + ' for ' + url + (body ? ': ' + String(body).slice(0, 300) : '')
  )

  const plugin = {
    /**
     * Returns the Nuxt layout for a requested layout name.
     *
     * Only a name in the `layouts` option is used, so a preview URL cannot
     * put the page in any other layout of the site.
     *
     * @param {*} name - The requested name, usually from `?layout=`.
     *
     * @returns {string|undefined} The layout, or undefined for the default.
     */
    layout: (name) => (typeof name === 'string' && layouts.includes(name) ? name : undefined),

    /**
     * Returns the preview endpoint from the URL fragment.
     *
     * The fragment never reaches any server, so the preview URL stays out of
     * request logs. It is only readable in the browser.
     *
     * @returns {string|null} The endpoint, or null when there is none.
     */
    endpoint: () => {
      const hash = (window.location.hash || '').slice(1)
      if (!hash) return null
      // vue-router normalises the URL, which collapses the double slash after
      // the scheme inside the fragment. Repair it.
      return decodeURIComponent(hash).replace(/^(https?):\/(?!\/)/, '$1://')
    },

    /**
     * Fetches the preview document with the editor's session.
     *
     * The request goes through the Druxt client, so the site's request
     * interceptors apply, with credentials, so the session cookie goes too.
     * A path stays a path. The client resolves it against its own base URL,
     * and interceptors that decide by path still see it.
     *
     * @param {string} endpoint - The JSON:API Node Preview endpoint.
     *
     * @returns {object} The JSON:API document.
     */
    fetch: async (endpoint) => {
      const url = withInclude(endpoint)
      const headers = { Accept: 'application/vnd.api+json' }
      const client = (app.$druxt || {}).axios
      if (client) {
        try {
          const response = await client.get(url, { headers, withCredentials: true })
          return response.data
        }
        catch (error) {
          const response = error.response || {}
          if (!response.status) throw error
          const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '')
          throw failure(url, response.status, body)
        }
      }
      const response = await window.fetch(url, { credentials: 'include', headers })
      if (!response.ok) {
        throw failure(url, response.status, await response.text().catch(() => ''))
      }
      return response.json()
    },

    /**
     * Seeds the Druxt store with the preview document.
     *
     * The main resource and every included resource are stored, so a
     * DruxtEntity render finds the unsaved preview data instead of fetching
     * the saved data from the API.
     *
     * @param {object} doc - The JSON:API document.
     *
     * @returns {object} The type and id of the previewed resource.
     */
    seed: (doc) => {
      for (const data of [doc.data, ...(doc.included || [])]) {
        store.commit('druxt/addResource', { resource: { data } })
        seeded.push({ type: data.type, id: data.id })
      }
      store.commit('druxtNodePreview/start', doc.data.id)
      return { type: doc.data.type, id: doc.data.id }
    },
  }

  inject('druxtNodePreview', plugin)
}
