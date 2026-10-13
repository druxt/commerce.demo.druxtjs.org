<script>

import DruxtModule from 'druxt/dist/components/DruxtModule.vue'

/**
 * A JSON:API response, fetched on the first open and shown as it came.
 * Themed by `DruxtDemoDrawerDefault`, which opens and closes it by emitting
 * `input` with `'toggle'`.
 *
 * @example @lang vue
 * <DruxtDemoDrawer path="/jsonapi/node/recipe?page[limit]=3" />
 */
export default {
  name: 'DruxtDemoDrawer',

  extends: DruxtModule,

  props: {
    /** The JSON:API path, with its query. */
    path: { type: String, required: true },
  },

  // `failure`, since DruxtModule has an `error` method of its own.
  data: () => ({ open: false, response: null, failure: '', loading: false }),

  watch: {
    // The theme's action, over the v-model channel every DruxtModule has.
    model(action) {
      if (!action) return
      if (action === 'toggle') this.toggle()
      this.model = null
    },

    // A reused drawer starts again for the new path.
    path() {
      this.response = null
      this.failure = ''
      this.loading = false
    },
  },

  methods: {
    async toggle() {
      this.open = !this.open
      if (this.open) await this.load()
    },

    /** Fetched once, through the same client the page uses. */
    async load() {
      if (this.response || this.loading) return
      const path = this.path
      this.loading = true
      try {
        const { data } = await this.$druxt.axios.get(path, {
          headers: { Accept: 'application/vnd.api+json' },
        })
        if (path === this.path) this.response = data
      } catch (e) {
        if (path === this.path) {
          this.failure = 'The response could not be loaded.'
        }
      } finally {
        if (path === this.path) this.loading = false
      }
    },
  },

  druxt: {
    componentOptions: () => [['default']],

    propsData: ({ path, open, response, failure, loading }) => ({
      path,
      open,
      response,
      error: failure,
      loading,
    }),

    slots(h) {
      const p = this.component.propsData
      return {
        default: () =>
          h('div', { class: 'druxt-demo-drawer' }, [
            h(
              'button',
              {
                class: 'druxt-demo-drawer__toggle',
                attrs: {
                  type: 'button',
                  'aria-expanded': p.open ? 'true' : 'false',
                },
                on: { click: () => this.toggle() },
              },
              p.open
                ? 'Hide the JSON:API response'
                : 'Show the JSON:API response'
            ),
            p.open
              ? h('div', { class: 'druxt-demo-drawer__body' }, [
                  h('pre', `GET ${p.path}`),
                  p.response
                    ? h('pre', JSON.stringify(p.response, null, 2))
                    : null,
                  p.error ? h('p', p.error) : null,
                  p.loading ? h('p', 'Loading') : null,
                ])
              : null,
          ]),
      }
    },
  },
}
</script>
