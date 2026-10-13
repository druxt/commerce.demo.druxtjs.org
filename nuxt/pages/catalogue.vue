<template>
  <div class="mx-auto max-w-7xl px-5 py-12 flex flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-3xl">Catalogue</h1>
      <p class="text-ink-2 max-w-2xl">
        Every product here is a Drupal Commerce entity, served over JSON:API and rendered
        by Nuxt. Physical goods and media titles are separate product types in Drupal and
        arrive as separate JSON:API resources.
      </p>
    </header>

    <nav class="flex flex-wrap gap-2" aria-label="Filter by product type">
      <button
        v-for="f in filters" :key="f.value" type="button"
        class="btn" :class="filter === f.value ? 'btn-primary' : 'btn-secondary'"
        :aria-pressed="String(filter === f.value)"
        @click="filter = f.value"
      >{{ f.label }}</button>
    </nav>

    <p v-if="$fetchState.pending" class="label-mono">Loading the catalogue…</p>
    <p v-else-if="$fetchState.error" class="card p-4 text-sm text-warn border-warn" role="alert">
      The catalogue could not be loaded.
    </p>

    <template v-else>
      <p class="label-mono" aria-live="polite">{{ visible.length }} products</p>
      <div class="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <ProductCard
          v-for="p in visible" :key="p.id"
          :title="p.title" :path="p.path" :price="p.price"
          :image="p.image" :collection="p.collection"
        />
      </div>
    </template>
  </div>
</template>

<script>
import { DrupalJsonApiParams } from 'drupal-jsonapi-params'

// Kickstart splits its catalogue across two product types. Both are listed,
// with the bundle kept on each row so the filter needs no second request.
const BUNDLES = [
  { type: 'product--physical', label: 'Physical' },
  { type: 'product--media', label: 'Media' },
]

export default {
  name: 'CataloguePage',

  head: () => ({ title: 'Catalogue' }),

  data: () => ({ products: [], filter: 'all' }),

  async fetch() {
    const query = new DrupalJsonApiParams()
      .addInclude(['variations', 'images', 'product_collections'])
      .addPageLimit(50)

    const collections = await Promise.all(
      BUNDLES.map(({ type }) => this.$store.dispatch('druxt/getCollection', { type, query }))
    )

    this.products = collections.flatMap((collection, index) => {
      const included = collection.included || []
      const find = (ref) => included.find((r) => ref && r.id === ref.id && r.type === ref.type)
      return (collection.data || []).map((p) => {
        const rels = p.relationships || {}
        const variation = find(((rels.variations || {}).data || [])[0])
        const image = find(((rels.images || {}).data || [])[0])
        const term = find(((rels.product_collections || {}).data || [])[0])
        return {
          id: p.id,
          bundle: BUNDLES[index].type,
          title: (p.attributes || {}).title,
          path: ((p.attributes || {}).path || {}).alias || `/products/${p.id}`,
          price: (((variation || {}).attributes || {}).price || {}).formatted || '',
          image: (((image || {}).attributes || {}).uri || {}).url || '',
          collection: ((term || {}).attributes || {}).name || '',
        }
      })
    })
  },

  computed: {
    filters: () => [{ value: 'all', label: 'Everything' }, ...BUNDLES.map((b) => ({ value: b.type, label: b.label }))],

    visible({ products, filter }) {
      return filter === 'all' ? products : products.filter((p) => p.bundle === filter)
    },
  },
}
</script>
