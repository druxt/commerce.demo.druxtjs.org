<script>

import DruxtModule from 'druxt/dist/components/DruxtModule.vue'

/**
 * The demo bar: what this site is, where its source is, and the overlay
 * switch. Themed by `DruxtDemoBarDefault` in the site's
 * `components/druxt/demo/`, which toggles with `$druxtDemo.toggleOverlay()`.
 *
 * @example @lang vue
 * <DruxtDemoBar notice="A demo. The daily reset wipes what visitors leave." />
 */
export default {
  name: 'DruxtDemoBar',

  extends: DruxtModule,

  props: {
    /** The repository the bar links to. The module option by default. */
    source: { type: String, default: undefined },
    /** The documentation link. */
    docs: { type: String, default: undefined },
    /** The community link. */
    discord: { type: String, default: undefined },
    /** One line naming what is live and what the reset wipes. */
    notice: { type: String, default: undefined },
  },

  computed: {
    demo: ({ $druxtDemo }) => $druxtDemo || {},
  },

  druxt: {
    componentOptions: () => [['default']],

    propsData: ({ demo, source, docs, discord, notice }) => ({
      source: source !== undefined ? source : demo.source || '',
      docs: docs !== undefined ? docs : demo.docs || '',
      discord: discord !== undefined ? discord : demo.discord || '',
      notice: notice !== undefined ? notice : demo.notice || '',
      overlay: !!demo.overlay,
    }),

    slots(h) {
      const p = this.component.propsData
      const link = (href, text) =>
        href
          ? h('a', { attrs: { href, rel: 'noopener', target: '_blank' } }, text)
          : null
      return {
        default: () =>
          h('div', { class: 'druxt-demo-bar' }, [
            h('span', { class: 'druxt-demo-bar__notice' }, p.notice),
            h('nav', { class: 'druxt-demo-bar__links' }, [
              link(p.source, 'View source'),
              link(p.docs, 'Docs'),
              link(p.discord, 'Discord'),
              h(
                'button',
                {
                  class: 'druxt-demo-bar__switch',
                  attrs: {
                    type: 'button',
                    role: 'switch',
                    'aria-checked': p.overlay ? 'true' : 'false',
                  },
                  on: {
                    click: () =>
                      this.demo.toggleOverlay && this.demo.toggleOverlay(),
                  },
                },
                [
                  'Druxt overlay',
                  h('span', {
                    class: 'druxt-demo-bar__knob',
                    attrs: { 'aria-hidden': 'true' },
                  }),
                ]
              ),
            ]),
          ]),
      }
    },
  },
}
</script>
