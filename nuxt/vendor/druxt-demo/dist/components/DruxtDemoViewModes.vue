<script>

import DruxtModule from 'druxt/dist/components/DruxtModule.vue'

/**
 * The same entity in each of its view modes. `full` is left out by default:
 * a switcher inside a full renderer would nest another copy of it. Themed by
 * `DruxtDemoViewModesDefault`, which picks a mode by emitting `input` with
 * its name.
 *
 * @example @lang vue
 * <DruxtDemoViewModes type="node--recipe" :uuid="uuid" :modes="['card', 'teaser']" />
 */
export default {
  name: 'DruxtDemoViewModes',

  extends: DruxtModule,

  props: {
    /** The entity's JSON:API resource type. */
    type: { type: String, required: true },
    /** The entity's uuid. */
    uuid: { type: String, required: true },
    /** The view modes to offer. The first is shown. */
    modes: { type: Array, default: () => ['card', 'teaser'] },
  },

  data: ({ modes }) => ({ mode: modes[0] }),

  watch: {
    // The theme's choice, over the v-model channel every DruxtModule has.
    model(mode) {
      if (!mode) return
      this.select(mode)
      this.model = null
    },
  },

  methods: {
    select(mode) {
      if (this.modes.includes(mode)) this.mode = mode
    },
  },

  druxt: {
    componentOptions: () => [['default']],

    propsData: ({ type, uuid, modes, mode }) => ({
      type,
      uuid,
      modes,
      mode,
    }),

    slots(h) {
      const p = this.component.propsData
      const modes = p.modes || []
      return {
        default: () =>
          h('div', { class: 'druxt-demo-view-modes' }, [
            h(
              'div',
              { attrs: { role: 'group', 'aria-label': 'View mode' } },
              modes.map((m) =>
                h(
                  'button',
                  {
                    key: m,
                    attrs: {
                      type: 'button',
                      'aria-pressed': m === p.mode ? 'true' : 'false',
                    },
                    on: { click: () => this.select(m) },
                  },
                  m
                )
              )
            ),
            h('DruxtEntity', {
              key: p.mode,
              props: { type: p.type, uuid: p.uuid, mode: p.mode },
            }),
          ]),
      }
    },
  },
}
</script>
