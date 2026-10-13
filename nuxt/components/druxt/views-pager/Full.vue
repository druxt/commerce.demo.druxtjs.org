<template>
  <!-- The Views pager, as links the page builds: the pattern, the filters and
       the sort stay in the URL, only the page moves. -->
  <nav v-if="pages > 1" class="flex flex-wrap items-center gap-2" aria-label="Pages">
    <NuxtLink
      v-if="current > 0"
      :to="link(current - 1)"
      class="h-11 px-3.5 inline-flex items-center bg-paper border border-line rounded text-13px font-500 hover:border-ink"
    >Previous</NuxtLink>
    <NuxtLink
      v-for="n in pages"
      :key="n"
      :to="link(n - 1)"
      class="h-11 min-w-11 px-3 inline-flex items-center justify-center bg-paper border rounded font-mono text-13px"
      :class="n - 1 === current ? 'border-ink font-700' : 'border-line hover:border-ink'"
      :aria-current="n - 1 === current ? 'page' : null"
    >{{ n }}</NuxtLink>
    <NuxtLink
      v-if="current < pages - 1"
      :to="link(current + 1)"
      class="h-11 px-3.5 inline-flex items-center bg-paper border border-line rounded text-13px font-500 hover:border-ink"
    >Next</NuxtLink>
  </nav>
</template>

<script>
import { DruxtViewsPagerMixin } from 'druxt-views'

export default {
  name: 'DruxtViewsPagerFull',

  mixins: [DruxtViewsPagerMixin],

  computed: {
    perPage: ({ options }) => Number((options || {}).items_per_page) || 12,

    pages: ({ count, perPage }) => Math.ceil((Number(count) || 0) / perPage),

    current: ({ value }) => Number(value) || 0,
  },

  methods: {
    link(page) {
      return { query: { ...this.$route.query, page: page || undefined } }
    },
  },
}
</script>
