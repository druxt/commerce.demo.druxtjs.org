<template>
  <section class="wrap pt-[clamp(36px,5vw,56px)] pb-12 flex flex-col gap-5">
    <div class="flex flex-wrap items-baseline justify-between gap-4">
      <h2 v-if="title" class="text-[clamp(21px,3vw,26px)]">{{ title }}</h2>
      <NuxtLink to="/catalogue" class="text-14px font-600 text-accent">
        Browse the catalogue &rarr;
      </NuxtLink>
    </div>

    <div v-if="products.length" class="grid gap-[clamp(12px,1.6vw,20px)] grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))]">
      <ProductCard
        v-for="p in products"
        :key="p.id"
        :title="p.title"
        :path="p.path"
        :price="p.price"
        :image="p.image"
        :category="p.collection"
        wide
      />
    </div>

    <p v-else-if="!$fetchState.pending" class="label-mono">
      This block references no products.
    </p>
  </section>
</template>

<script>
import { DrupalJsonApiParams } from 'drupal-jsonapi-params'
import inlineBlock from '~/mixins/inlineBlock'

export default {
  name: 'DruxtLayoutBuilderInlineBlockCklbProducts',

  mixins: [inlineBlock],

  data: () => ({
    products: [],
    // The referenced products come back with the block, so the card data is
    // one request rather than one per product.
    blockIncludes: ['cklb_products'],
  }),

  async fetch() {
    // Load the block itself first, for its title and product references.
    await inlineBlock.fetch.call(this)

    const refs = (((this.block || {}).relationships || {}).cklb_products || {}).data || []
    if (!refs.length) return

    // Group by resource type before fetching. The blocks do not all reference
    // the same product bundle: "New products" and "Best sellers" are
    // product--physical, while "Books" is product--media.
    // Hardcoding `physical` made the Books block report that it referenced no
    // products, when it references three.
    const byType = refs.reduce((acc, r) => {
      if (!r.type || !r.id) return acc
      ;(acc[r.type] = acc[r.type] || []).push(r.id)
      return acc
    }, {})

    // One request per bundle, not one per card.
    const collections = await Promise.all(
      Object.entries(byType).map(([type, ids]) =>
        this.$store.dispatch('druxt/getCollection', {
          type,
          query: new DrupalJsonApiParams()
            .addFilter('id', ids, 'IN')
            .addInclude(['variations', 'images', 'product_collections']),
        })
      )
    )

    const included = collections.flatMap((c) => c.included || [])
    const data = collections.flatMap((c) => c.data || [])
    const find = (ref) => included.find((r) => ref && r.id === ref.id && r.type === ref.type)

    this.products = data.map((p) => {
      const rels = p.relationships || {}
      const variation = find(((rels.variations || {}).data || [])[0])
      const image = find(((rels.images || {}).data || [])[0])
      const term = find(((rels.product_collections || {}).data || [])[0])
      return {
        id: p.id,
        title: (p.attributes || {}).title,
        path: ((p.attributes || {}).path || {}).alias || `/products/${p.id}`,
        price: (((variation || {}).attributes || {}).price || {}).formatted || '',
        image: (((image || {}).attributes || {}).uri || {}).url || '',
        collection: ((term || {}).attributes || {}).name || '',
      }
    })
  },

  computed: {
    title: ({ attrs }) => attrs.cklb_title || 'Products',
  },
}
</script>
