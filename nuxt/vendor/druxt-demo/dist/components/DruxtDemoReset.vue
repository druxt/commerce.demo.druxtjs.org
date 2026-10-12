<script>

import DruxtModule from 'druxt/dist/components/DruxtModule.vue'

/**
 * The way back to the fresh demo. Asks first: the reset is for everyone.
 * Renders nothing unless the module's `reset` option names a file. Themed
 * by `DruxtDemoResetDefault`, which emits `input` with `'start'`, `'confirm'`
 * or `'cancel'`.
 *
 * @example @lang vue
 * <DruxtDemoReset />
 */
export default {
  name: 'DruxtDemoReset',

  extends: DruxtModule,

  data: () => ({ open: false, busy: false, message: '' }),

  computed: {
    available: ({ $druxtDemo }) =>
      typeof ($druxtDemo || {}).reset === 'function',
  },

  watch: {
    // The theme's action, over the v-model channel every DruxtModule has.
    model(action) {
      if (!action) return
      if (action === 'start') this.start()
      if (action === 'confirm') this.confirm()
      if (action === 'cancel') this.cancel()
      this.model = null
    },
  },

  methods: {
    start() {
      this.open = true
      this.message = ''
    },

    cancel() {
      this.open = false
    },

    async confirm() {
      this.busy = true
      try {
        const result = await this.$druxtDemo.reset()
        this.message =
          typeof result === 'string'
            ? result
            : 'The demo is back to its fresh state.'
      } catch (e) {
        this.message = `The reset failed: ${e.message}`
      }
      this.busy = false
    },
  },

  druxt: {
    componentOptions: () => [['default']],

    propsData: ({ open, busy, message, available }) => ({
      open,
      busy,
      message,
      available,
    }),

    slots(h) {
      const p = this.component.propsData
      if (!p.available) return { default: () => null }
      const button = (text, on, attrs = {}) =>
        h(
          'button',
          {
            attrs: { type: 'button', ...attrs },
            on: { click: on },
          },
          text
        )
      return {
        default: () =>
          h('span', { class: 'druxt-demo-reset' }, [
            button(
              p.busy ? 'Resetting' : 'Reset the demo',
              () => this.start(),
              {
                disabled: p.busy,
              }
            ),
            p.open
              ? h(
                  'div',
                  {
                    class: 'druxt-demo-reset__dialog',
                    attrs: {
                      role: 'dialog',
                      'aria-modal': 'true',
                      'aria-label': 'Reset the demo',
                    },
                  },
                  [
                    h(
                      'p',
                      p.message ||
                        'This puts the demo back to its fresh state, for everyone using it. Carry on?'
                    ),
                    p.message
                      ? button('Close', () => this.cancel())
                      : h('div', [
                          button('Yes, reset it', () => this.confirm(), {
                            'data-confirm': '',
                            disabled: p.busy,
                          }),
                          button('No', () => this.cancel()),
                        ]),
                  ]
                )
              : null,
          ]),
      }
    },
  },
}
</script>
