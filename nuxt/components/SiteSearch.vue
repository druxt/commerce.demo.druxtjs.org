<template>
  <div class="relative w-full">
    <span class="absolute left-3 inset-y-0 flex items-center text-ink-3 pointer-events-none" aria-hidden="true">⌕</span>
    <input
      :id="id"
      v-model="query"
      type="search"
      role="combobox"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="`${id}-list`"
      aria-autocomplete="list"
      aria-label="Search products"
      placeholder="Search products"
      autocomplete="off"
      class="w-full h-11 md:h-38px pl-8.5 pr-3 text-16px md:text-13px bg-paper-2 border border-line rounded text-ink outline-none focus:border-ink focus:bg-paper"
      @focus="show"
      @blur="hide"
      @keydown.enter.prevent="seeAll"
      @keydown.esc="open = false"
    >

    <!-- Opens on focus, not just on input, so an empty field still offers
         something. Every row reads the hydrated catalogue: no request per key. -->
    <div
      v-if="open"
      :id="`${id}-list`"
      class="suggest absolute top-full mt-1.5 inset-x-0 z-70 bg-paper border border-line-2 overflow-auto max-h-60vh"
    >
      <div class="flex justify-between gap-3 px-3 py-2 border-b border-line font-mono text-10px tracking-widest uppercase text-ink-3">
        <span>{{ query ? `${matches.length} matching products` : 'Popular right now' }}</span>
        <span class="hidden md:inline">↵ to see all</span>
      </div>

      <NuxtLink
        v-for="p in shown"
        :key="p.id"
        :to="p.path"
        class="flex items-center gap-3 px-3 py-2.5 min-h-11 border-b border-paper-2 hover:bg-paper-2"
        @mousedown.native.prevent
        @click.native="open = false"
      >
        <img v-if="p.image" :src="p.image" alt="" class="w-11 h-11 md:w-38px md:h-38px object-cover shrink-0">
        <span class="flex-1 min-w-0">
          <span class="block text-13px font-600 leading-snug">{{ p.title }}</span>
          <span class="block font-mono text-10px text-ink-3">{{ p.category }}</span>
        </span>
        <span class="font-mono text-13px">{{ p.price }}</span>
      </NuxtLink>

      <p v-if="query && !matches.length" class="px-3 py-4 text-13px text-ink-2">
        No product matches that.
      </p>

      <button
        v-if="matches.length > shown.length"
        type="button"
        class="block w-full text-left px-3 py-2.5 min-h-11 text-12px font-600 text-accent bg-paper-3"
        @mousedown.prevent
        @click="seeAll"
      >See all {{ matches.length }} matches →</button>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'

// The five shown when the field is empty. Kickstart's own best sellers.
const POPULAR = ['Gigantic Inflatable Flamingo', 'White & Wood Chair', 'Knit Hat in Green', 'Cocoa Fedora', 'Black Headphones']

export default {
  name: 'SiteSearch',

  props: {
    id: { type: String, default: 'site-search' },
  },

  data: () => ({ query: '', open: false }),

  computed: {
    ...mapState('catalogue', ['items']),

    matches({ items, query }) {
      const q = query.trim().toLowerCase()
      if (!q) return []
      return items.filter((p) =>
        [p.title, p.category, p.brand, p.sku, ...p.collections].join(' ').toLowerCase().includes(q)
      )
    },

    shown({ items, query, matches }) {
      if (query.trim()) return matches.slice(0, 5)
      return POPULAR.map((t) => items.find((p) => p.title === t)).filter(Boolean)
    },
  },

  watch: {
    // A new page closes the panel and clears the field it was opened from.
    $route() {
      this.open = false
    },
  },

  methods: {
    show() {
      this.open = true
      this.$store.dispatch('catalogue/load')
    },

    // Delayed, so a click on a row lands before the panel goes.
    hide() {
      setTimeout(() => { this.open = false }, 160)
    },

    seeAll() {
      this.open = false
      const q = this.query.trim()
      this.$router.push({ path: '/catalogue', query: q ? { q } : {} })
    },
  },
}
</script>

<style>
.suggest {
  box-shadow: 0 18px 40px rgba(16, 18, 20, 0.14);
  animation: suggest-drop 160ms ease both;
}
@keyframes suggest-drop {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: none; }
}
</style>
