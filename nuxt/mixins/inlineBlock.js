import { DrupalJsonApiParams } from 'drupal-jsonapi-params'

/**
 * In-flight and completed collection cache, keyed by bundle and includes.
 *
 * Every inline block component has to fetch its whole bundle, because
 * filtering block_content by id returns nothing. Three heroes on one page
 * meant three identical requests for the same three blocks, and the page was
 * making about twenty sequential requests in total. Storing the promise rather
 * than the result means concurrent components share one request instead of
 * racing to start their own.
 *
 * Module scope, so it is per server process and per browser tab. That is the
 * right lifetime: a rebuild or a reload starts clean, and nothing stale
 * survives a content change for longer than the page it was fetched for.
 */
const collections = new Map()

/**
 * Loads the block_content entity behind a Layout Builder inline block.
 *
 * The section data names the block and gives its internal id, but not its
 * content. Access to a non-reusable block is resolved through the host entity
 * recorded in `inline_block_usage`; provisioning registers that, because the
 * Kickstart recipe does not.
 */
export default {
  props: {
    component: { type: Object, required: true },
    entity: { type: Object, required: true },
  },

  data: () => ({
    block: undefined,
    blockError: undefined,
    included: [],
    // Overridden per component where the block references media or entities.
    blockIncludes: [],
  }),

  async fetch() {
    const id = this.blockId
    const type = this.blockType
    if (!id || !type) return

    try {
      // Filtering block_content by drupal_internal__id returns nothing, in
      // every syntax JSON:API accepts, while the unfiltered collection returns
      // the blocks. Non-reusable blocks resolve their view access through a
      // host entity, and that resolution happens per entity after the query
      // has already excluded them. So the bundle is fetched whole and matched
      // here. There is a handful of each per page, and it is one request
      // either way; if a site ever had many, this is where it would hurt.
      const key = `${type}|${this.blockIncludes.join(',')}`
      if (!collections.has(key)) {
        const query = new DrupalJsonApiParams()
        // Media references resolve two hops out, so the file arrives alongside
        // the block instead of costing a request per image.
        if (this.blockIncludes.length) query.addInclude(this.blockIncludes)

        collections.set(key, this.$store.dispatch('druxt/getCollection', {
          type: `block_content--${type}`,
          query,
        }))
      }

      const collection = await collections.get(key)
      this.block = (collection.data || []).find(
        (b) => String(((b.attributes || {}).drupal_internal__id)) === String(id)
      )
      this.included = collection.included || []
    } catch (e) {
      // A failed request must not be cached, or every later component on the
      // page inherits the failure and no retry is possible.
      collections.delete(`${type}|${this.blockIncludes.join(',')}`)
      // A block that cannot be read is a finding, not a blank space. It is
      // surfaced in development rather than rendering silently as nothing.
      this.blockError = e
    }
  },

  computed: {
    blockId: ({ component }) => ((component || {}).configuration || {}).block_id,

    // "inline_block:cklb_hero" -> "cklb_hero"
    blockType: ({ component }) => {
      const id = ((component || {}).configuration || {}).id || ''
      return id.startsWith('inline_block:') ? id.slice('inline_block:'.length) : undefined
    },

    attrs: ({ block }) => (block || {}).attributes || {},

    // Bootstrap Layout Builder stores presentation on the component rather
    // than the block, including the background media reference.
    blockStyle: ({ component }) =>
      (((component || {}).additional || {}).bootstrap_styles || {}).block_style || {},
  },

  methods: {
    // Drupal link fields carry both the raw uri and a resolved path.
    linkPath(field) {
      if (!field) return undefined
      return field.resolvable_uri || (field.uri || '').replace(/^internal:/, '') || undefined
    },
  },
}
