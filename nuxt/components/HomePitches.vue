<template>
  <!-- What the page above is made of. The content is Drupal's Layout Builder
       page; this strip says which half did what. -->
  <section class="bg-ink text-paper">
    <div class="wrap py-[clamp(36px,5vw,56px)]">
      <div class="grid gap-px bg-ink-2/50 border border-ink-2/50 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        <div v-for="s in stats" :key="s.label" class="bg-ink px-5 py-5.5">
          <p class="font-mono text-26px font-500 text-mint mb-1.5">{{ s.value }}</p>
          <p class="text-12px leading-snug text-ink-3">{{ s.label }}</p>
        </div>
      </div>
    </div>

    <div class="bg-paper text-ink border-t border-line">
      <div class="wrap py-[clamp(36px,5vw,56px)]">
        <div class="grid gap-px bg-line border border-line grid-cols-[repeat(auto-fit,minmax(min(100%,270px),1fr))]">
          <div v-for="p in pitches" :key="p.title" class="bg-paper px-6.5 py-7">
            <p class="font-mono text-11px tracking-widest uppercase text-accent mb-3">{{ p.kicker }}</p>
            <h3 class="text-18px font-600 tracking-tight mb-2.5">{{ p.title }}</h3>
            <p class="text-14px leading-relaxed text-ink-2">{{ p.body }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'HomePitches',

  async fetch() {
    await this.$store.dispatch('catalogue/load')
  },

  data: () => ({
    pitches: [
      { kicker: 'Druxt Entity', title: 'Products render themselves', body: 'A commerce_product view mode maps to a Vue component. Change the display in Drupal and the storefront follows, with no front-end deploy.' },
      { kicker: 'Druxt store', title: 'Facets without round trips', body: 'The catalogue arrives once as a JSON:API collection. Filtering and search happen in the browser at typing speed.' },
      { kicker: 'Commerce API', title: 'A real Drupal cart', body: 'Add to cart writes a Drupal Commerce order over JSON:API, so totals, tax and promotions are Commerce’s own sums.' },
    ],
  }),

  computed: {
    stats: ({ $store }) => [
      { value: String($store.state.catalogue.items.length), label: 'products, straight from commerce_product' },
      { value: '0', label: 'page loads between browse and checkout' },
      { value: '1', label: 'Nuxt app, no custom Drupal theme' },
      { value: 'JSON:API', label: 'the only contract between the two' },
    ],
  },
}
</script>
