<script>
import DruxtModule from 'druxt/dist/components/DruxtModule.vue'

/**
 * Renders a seeded node preview through a themeable wrapper.
 *
 * The wrapper is picked by the node's bundle and view mode, like every Druxt
 * module, so a site can wrap the preview in the same page chrome as the live
 * route. For a `node--page` previewed in `full`, the first of these that
 * exists is used:
 *
 * - `DruxtNodePreviewPageFull`
 * - `DruxtNodePreviewPage`
 * - `DruxtNodePreviewDefault`
 *
 * The wrapper receives the props it declares from: `document` (the whole
 * JSON:API preview document), `entity` (its main resource), `mode`, `type`
 * and `uuid`. Its default slot renders the node with `DruxtEntity`.
 *
 * A wrapper is any component with that name, for example
 * `components/druxt/node-preview/Page.vue` declaring an `entity` prop and
 * rendering `<h1>{{ entity.attributes.title }}</h1><slot />`.
 */
export default {
  name: 'DruxtNodePreview',

  extends: DruxtModule,

  props: {
    /**
     * The JSON:API preview document, already seeded into the store.
     *
     * @type {object}
     */
    document: {
      type: Object,
      required: true,
    },

    /**
     * The view mode being previewed.
     *
     * @type {string}
     */
    mode: {
      type: String,
      default: 'full',
    },
  },

  computed: {
    /** The previewed resource. */
    entity: ({ document }) => (document || {}).data || {},

    /** The bundle, from a JSON:API type like `node--page`. */
    bundle: ({ entity }) => (entity.type || '').split('--').slice(1).join('--'),
  },

  druxt: {
    componentOptions: ({ bundle, mode }) => [[bundle, mode], ['default']],

    propsData: ({ document, entity, mode }) => ({
      document,
      entity,
      mode,
      type: entity.type,
      uuid: entity.id,
    }),

    slots(h) {
      return {
        default: () => h('DruxtEntity', {
          key: this.entity.id,
          props: {
            mode: this.mode,
            type: this.entity.type,
            uuid: this.entity.id,
          },
        }),
      }
    },
  },
}
</script>
