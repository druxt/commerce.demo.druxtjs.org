<template>
  <div class="wrap pt-6 pb-18">
    <header class="flex flex-wrap items-baseline gap-3 mb-4.5">
      <h1 class="text-[clamp(24px,4vw,30px)]">Shop</h1>
      <p class="font-mono text-13px text-ink-2" aria-live="polite">{{ count }} products</p>
      <p v-if="collection" class="font-mono text-11px text-ink-2">
        in {{ collection }}
        <NuxtLink to="/shop" class="text-accent ml-1">all collections</NuxtLink>
      </p>
    </header>

    <!-- Drupal runs the filters; the URL remembers them. -->
    <div class="flex flex-wrap items-center gap-2 pb-3.5 mb-1.5" role="group" aria-label="Brand">
      <!-- A brand with nothing in this collection cannot be picked. -->
      <button
        v-for="b in brands"
        :key="b.id"
        type="button"
        class="shrink-0 h-38px px-3.5 flex items-center gap-1.75 bg-paper border border-line-2 rounded-full text-13px font-500 disabled:opacity-40 disabled:cursor-not-allowed"
        :aria-pressed="picked.includes(b.id) ? 'true' : 'false'"
        :disabled="!b.count && !picked.includes(b.id)"
        @click="setBrand(b.id)"
      >
        <span v-if="picked.includes(b.id)" class="w-1.75 h-1.75 rounded-full bg-ink" aria-hidden="true" />
        {{ b.name }}
        <span class="font-mono text-11px text-ink-2">{{ b.count }}</span>
      </button>
      <label class="ml-auto shrink-0 flex items-center gap-2 text-13px">
        Sort
        <select
          class="h-38px border border-line-2 rounded bg-paper px-2 text-13px"
          :value="model.sort || 'title'"
          @change="setSort($event.target.value)"
        >
          <option value="title">Title</option>
          <option value="created">Newest</option>
        </select>
      </label>
    </div>

    <div class="grid gap-[clamp(12px,1.4vw,18px)] grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))]">
      <ProductCard
        v-for="p in items"
        :key="p.id"
        :title="p.title"
        :path="p.path"
        :price="p.price"
        :image="p.image"
        :category="p.category"
        :variation="p.variations[0]"
      />
    </div>
    <p v-if="!results.length" class="border border-dashed border-line-2 p-14 text-center text-14px text-ink-2">
      Nothing here for those brands.
      <button type="button" class="text-accent font-600" @click="clearBrands">Show every brand</button>
    </p>

    <div class="mt-6">
      <slot name="pager" />
    </div>

    <client-only>
      <DruxtDemoNote
        match="/jsonapi/views/products"
        file="nuxt/components/druxt/view/ProductsPage1.vue"
        body="Drupal runs this View. The collection in the path is its contextual argument, the brand is an exposed filter, and every change rewrites the URL and makes one request. Back and forward replay it."
      />
    </client-only>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { DruxtViewsViewMixin } from 'druxt-views'

// The pattern this page is registered under, for its aliases.
const PATTERN = '/shop/:collection?/:brand?'

// The same slug nuxt.config.js builds the aliases with.
const slug = (name) =>
  name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default {
  name: 'DruxtViewProductsPage1',

  mixins: [DruxtViewsViewMixin],

  head: () => ({ title: 'Shop' }),

  // The View says which products and in what order. The catalogue store
  // already holds everything a card needs for each of them.
  async fetch() {
    await this.$store.dispatch('catalogue/load')
  },

  computed: {
    ...mapState('catalogue', { catalogue: 'items' }),

    items: ({ results, catalogue }) =>
      results.map((r) => catalogue.find((p) => p.id === r.id)).filter(Boolean),

    aliases: ({ $druxtViewsPages }) => (($druxtViewsPages || {})[PATTERN] || {}).aliases || {},

    collection: ({ aliases, $route, catalogue }) => {
      const word = ($route.params || {}).collection
      if (!word || (aliases.collection || {})[word] === undefined) return ''
      const names = [...new Set(catalogue.flatMap((p) => [p.category, ...(p.collections || [])]))]
      return names.find((n) => slug(n) === word) || word.replace(/-/g, ' ')
    },

    // What the collection in the path holds, from the catalogue store, so
    // the pills can say how many of each brand there are to pick.
    scope: ({ catalogue, collection }) =>
      collection
        ? catalogue.filter((p) => p.category === collection || (p.collections || []).includes(collection))
        : catalogue,

    // The aliases give the words and ids; the catalogue store gives the names
    // as Drupal spells them and the counts. A brand with no products at all
    // is left out.
    brands: ({ aliases, catalogue, scope }) => {
      const names = [...new Set(catalogue.map((p) => p.brand).filter(Boolean))]
      return Object.entries(aliases.brand || {})
        .map(([word, id]) => {
          const name = names.find((n) => slug(n) === word)
          return name && { id: String(id), name, count: scope.filter((p) => p.brand === name).length }
        })
        .filter(Boolean)
    },

    // The brands picked, always a list: the filter takes several.
    picked: ({ model }) => [].concat(((model || {}).filter || {}).brand || []).map(String),
  },

  methods: {
    // A new model object, so the mixin emits it and the page writes the URL.
    setBrand(id) {
      const filter = { ...((this.model || {}).filter || {}) }
      const next = this.picked.includes(id) ? this.picked.filter((b) => b !== id) : [...this.picked, id]
      if (next.length) filter.brand = next
      else delete filter.brand
      this.model = { ...this.model, filter, page: null }
    },

    clearBrands() {
      const filter = { ...((this.model || {}).filter || {}) }
      delete filter.brand
      this.model = { ...this.model, filter, page: null }
    },

    setSort(sort) {
      this.model = { ...this.model, sort: sort === 'title' ? null : sort, page: null }
    },
  },
}
</script>
