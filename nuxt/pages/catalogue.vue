<template>
  <div class="wrap pt-6 pb-18">
    <header class="flex flex-wrap items-baseline gap-3 mb-4.5">
      <h1 class="text-[clamp(24px,4vw,30px)]">Catalogue</h1>
      <p class="font-mono text-13px text-ink-2" aria-live="polite">{{ results.length }} of {{ items.length }} products</p>
      <p v-if="query" class="font-mono text-11px text-ink-2">
        matching “{{ query }}”
        <NuxtLink :to="{ query: { ...$route.query, q: undefined } }" class="text-accent ml-1">clear</NuxtLink>
      </p>
    </header>

    <!-- Below 768px the rail flattens into one scrolling row of pills. -->
    <div class="md:hidden flex gap-2 overflow-x-auto pb-3.5 mb-1.5 -mx-4 px-4" role="group" aria-label="Filters">
      <button
        v-for="o in flatOptions"
        :key="`${o.group}:${o.value}`"
        type="button"
        class="shrink-0 h-38px px-3.5 flex items-center gap-1.75 bg-paper border border-line-2 rounded-full text-13px font-500"
        :aria-pressed="o.active ? 'true' : 'false'"
        @click="toggle(o.group, o.value)"
      >
        <span v-if="o.active" class="w-1.75 h-1.75 rounded-full bg-ink" aria-hidden="true" />
        {{ o.label }}
      </button>
    </div>

    <div class="flex flex-wrap items-start gap-[clamp(20px,2.4vw,32px)]">
      <aside class="hidden md:flex flex-[0_1_212px] min-w-190px sticky top-24 flex-col gap-6.5" aria-label="Filters">
        <fieldset v-for="g in groups" :key="g.key" class="border-0 m-0 p-0">
          <legend class="font-mono text-10px tracking-widest uppercase text-ink-3 mb-3">{{ g.label }}</legend>
          <label
            v-for="o in g.options"
            :key="o.value"
            class="flex items-center gap-2.25 py-1.25 text-14px cursor-pointer"
          >
            <input type="checkbox" class="facet-box" :checked="o.active" @change="toggle(g.key, o.value)">
            <span class="flex-1">{{ o.label }}</span>
            <span class="font-mono text-11px text-ink-3">{{ o.count }}</span>
          </label>
        </fieldset>
        <button type="button" class="h-11 bg-paper border border-line rounded text-13px font-500 text-ink-2 hover:border-ink hover:text-ink" @click="clear">
          Clear filters
        </button>
        <client-only>
          <DruxtDemoNote
            match="/jsonapi/products/physical"
            file="nuxt/store/catalogue.js"
            body="Three requests at render time fetched the products, the books and the collection tree, each with its variations and images. Facets, search and sorting filter that collection in the browser, with no request."
          />
        </client-only>
      </aside>

      <div class="flex-[1_1_520px] min-w-0">
        <p v-if="$fetchState.error" class="card p-4 text-sm text-warn" role="alert">The catalogue could not be loaded.</p>

        <div class="grid gap-[clamp(12px,1.4vw,18px)] grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))]">
          <ProductCard
            v-for="p in results"
            :key="p.id"
            :title="p.title"
            :path="p.path"
            :price="p.price"
            :image="p.image"
            :category="p.category"
            :variation="p.variations[0]"
          />
        </div>

        <p v-if="items.length && !results.length" class="border border-dashed border-line-2 p-14 text-center text-14px text-ink-2">
          Nothing matches those filters.
          <button type="button" class="text-accent font-600" @click="clear">Clear them</button>
        </p>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { PRICE_BANDS } from '~/store/catalogue'

// Facet state lives in the URL, so a filtered catalogue can be shared and the
// back button undoes a filter. Changing it is a client-side query change: the
// page does not fetch again.
const GROUPS = ['category', 'price', 'brand']
const listOf = (value) => (value ? [].concat(value).join(',').split(',').filter(Boolean) : [])

export default {
  name: 'CataloguePage',

  async fetch() {
    await this.$store.dispatch('catalogue/load')
  },

  head: () => ({ title: 'Catalogue' }),

  computed: {
    ...mapState('catalogue', ['items']),

    query: ({ $route }) => String($route.query.q || '').trim(),

    active: ({ $route }) => Object.fromEntries(GROUPS.map((g) => [g, listOf($route.query[g])])),

    // Each group narrows the results the other groups produce, and its counts
    // say what picking an option would give.
    groups() {
      const count = (except, test) => this.filter(except).filter(test).length
      const option = (group, value, label, test) => ({
        value, label, test,
        count: count(group, test),
        active: this.active[group].includes(value),
      })
      return [
        {
          key: 'category',
          label: 'Category',
          options: this.$store.getters['catalogue/categories']
            .map((c) => option('category', c, c, (p) => p.category === c)),
        },
        {
          key: 'price',
          label: 'Price',
          options: PRICE_BANDS.map((b) => option('price', b.key, b.label, (p) => b.test(p.amount))),
        },
        {
          key: 'brand',
          label: 'Brand',
          options: this.$store.getters['catalogue/brands']
            .map((b) => option('brand', b, b, (p) => p.brand === b)),
        },
      ]
    },

    flatOptions: ({ groups }) => groups.flatMap((g) => g.options.map((o) => ({ ...o, group: g.key }))),

    results() {
      return this.filter()
    },
  },

  methods: {
    // The catalogue narrowed by the search and every group but `except`.
    filter(except) {
      const q = this.query.toLowerCase()
      const tests = {
        category: (p, v) => p.category === v,
        price: (p, v) => (PRICE_BANDS.find((b) => b.key === v) || { test: () => true }).test(p.amount),
        brand: (p, v) => p.brand === v,
      }
      return this.items.filter((p) =>
        (!q || [p.title, p.category, p.brand, p.sku, ...p.collections].join(' ').toLowerCase().includes(q)) &&
        GROUPS.every((g) => g === except || !this.active[g].length || this.active[g].some((v) => tests[g](p, v)))
      )
    },

    toggle(group, value) {
      const current = this.active[group]
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
      this.$router.replace({ query: { ...this.$route.query, [group]: next.length ? next.join(',') : undefined } })
    },

    clear() {
      this.$router.replace({ query: this.query ? { q: this.query } : {} })
    },
  },
}
</script>

<style>
/* A square checkbox drawn to the design: the native one cannot be squared
   off or filled with a block. */
.facet-box {
  appearance: none;
  width: 14px;
  height: 14px;
  margin: 0;
  border: 1px solid #b8b4ac;
  background: var(--paper);
  display: grid;
  place-content: center;
  flex-shrink: 0;
}
.facet-box:checked::before {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--ink);
}
</style>
