<template>
  <article class="wrap pt-5 pb-18">
    <nav class="font-mono text-12px text-ink-3 mb-5.5 flex gap-2 min-w-0" aria-label="Breadcrumb">
      <NuxtLink to="/catalogue" class="text-ink-2 hover:text-ink shrink-0">Catalogue</NuxtLink>
      <span aria-hidden="true">/</span>
      <NuxtLink v-if="item && item.category" :to="{ path: '/catalogue', query: { category: item.category } }" class="text-ink-2 hover:text-ink shrink-0">{{ item.category }}</NuxtLink>
      <span v-if="item && item.category" aria-hidden="true">/</span>
      <span class="text-ink truncate" aria-current="page">{{ title }}</span>
    </nav>

    <div class="grid items-start gap-[clamp(24px,4vw,48px)] grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))]">
      <!-- Gallery. Swipes on touch; the thumbnails are the same choice for a
           pointer or a keyboard. -->
      <div class="flex flex-col gap-3">
        <div
          class="relative aspect-square bg-paper-3 border border-line overflow-hidden touch-pan-y"
          @touchstart.passive="swipeStart"
          @touchend.passive="swipeEnd"
        >
          <img v-if="activeImage" :src="activeImage" :alt="title" class="w-full h-full object-cover">
          <span v-else class="absolute left-4 bottom-4 font-mono text-11px text-ink-3 bg-paper px-2 py-1">no image</span>
          <span v-if="images.length > 1" class="md:hidden absolute right-3 bottom-3 font-mono text-11px bg-paper px-2 py-1" aria-hidden="true">
            {{ imageIndex + 1 }} / {{ images.length }}
          </span>
        </div>

        <div v-if="images.length > 1" class="grid grid-cols-4 gap-3">
          <button
            v-for="(img, i) in images"
            :key="img"
            type="button"
            class="aspect-square overflow-hidden border p-0 bg-paper-3"
            :class="i === imageIndex ? 'border-ink' : 'border-line hover:border-line-2'"
            :aria-label="`Show image ${i + 1} of ${images.length}`"
            :aria-pressed="i === imageIndex ? 'true' : 'false'"
            @click="imageIndex = i"
          >
            <img :src="img" alt="" class="w-full h-full object-cover">
          </button>
        </div>
      </div>

      <!-- Detail. Sticky beside the gallery only where there is room for it. -->
      <div class="md:sticky md:top-24">
        <p v-if="item && item.category" class="font-mono text-11px tracking-wider uppercase text-ink-3 mb-2.5">{{ item.category }}</p>
        <h1 class="text-[clamp(26px,4.6vw,38px)] leading-[1.08] tracking-tight mb-3.5">{{ title }}</h1>
        <p v-if="price" class="font-mono text-24px font-500 mb-4.5">{{ price }}</p>
        <div v-if="body" class="prose text-15px leading-relaxed text-ink-2 mb-6.5 max-w-[52ch]" v-html="body" />

        <!-- Hidden entirely when there is only one variation. -->
        <fieldset v-if="variations.length > 1" class="border-0 mx-0 mt-0 p-0 mb-5.5">
          <legend class="font-mono text-10px tracking-widest uppercase text-ink-3 mb-2.5">{{ variationLabel }}</legend>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="v in variations"
              :key="v.id"
              type="button"
              class="min-w-12 h-11 px-3 bg-paper border rounded text-14px"
              :class="v.id === activeVariation.id ? 'border-ink font-700' : 'border-line-2 font-500 hover:border-ink'"
              :aria-pressed="v.id === activeVariation.id ? 'true' : 'false'"
              @click="activeVariationId = v.id"
            >{{ v.label }}</button>
          </div>
        </fieldset>

        <div class="flex flex-wrap items-center gap-3 mb-3.5">
          <button
            type="button"
            class="flex-[1_1_180px] h-12.5 bg-ink text-paper rounded text-15px font-600 hover:bg-ink-2 disabled:opacity-50"
            :disabled="!activeVariation || busy"
            @click="addToCart"
          >{{ added ? 'Added to cart' : `Add to cart · ${price}` }}</button>
        </div>
        <p class="font-mono text-11px text-ink-2 mb-6.5" aria-live="polite">
          {{ cartError || (added ? 'In your cart. Commerce has recalculated the order.' : 'Ships in 2 business days.') }}
        </p>

        <dl class="border-t border-line pt-5 grid gap-x-6 gap-y-3.5 grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
          <div v-for="m in meta" :key="m.label">
            <dt class="font-mono text-10px tracking-wider uppercase text-ink-3 mb-1">{{ m.label }}</dt>
            <dd class="m-0 text-13px break-words" :class="m.mono && 'font-mono'">{{ m.value }}</dd>
          </div>
        </dl>

        <client-only>
          <DruxtDemoNote
            class="mt-6"
            match="/jsonapi/products/"
            file="nuxt/components/druxt/entity/product/physical/Full.vue"
            body="The route resolved through decoupled_router to this product, which the catalogue already held. The page made no request of its own."
          />
        </client-only>
      </div>
    </div>

    <section v-if="related.length" class="mt-16 border-t border-line pt-8">
      <div class="flex flex-wrap items-baseline gap-3 mb-4.5">
        <h2 class="text-20px">Goes well with</h2>
        <span class="font-mono text-11px text-ink-3">more from {{ item.category }}</span>
      </div>
      <div class="grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))]">
        <NuxtLink
          v-for="p in related"
          :key="p.id"
          :to="p.path"
          class="flex items-center gap-3 p-3 bg-paper border border-line hover:border-ink"
        >
          <img v-if="p.image" :src="p.image" alt="" loading="lazy" class="w-16 h-16 object-cover shrink-0">
          <span class="min-w-0">
            <span class="block text-14px font-600 leading-tight mb-1">{{ p.title }}</span>
            <span class="block font-mono text-13px">{{ p.price }}</span>
          </span>
        </NuxtLink>
      </div>
    </section>
  </article>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'DruxtEntityProductPhysicalFull',

  props: {
    entity: { type: Object, required: true },
  },

  data: () => ({
    activeVariationId: undefined,
    imageIndex: 0,
    touchX: undefined,
    busy: false,
    added: false,
  }),

  // References come from the catalogue the rest of the store already holds,
  // so arriving from the catalogue costs no request for them.
  async fetch() {
    await this.$store.dispatch('catalogue/load')
  },

  head() {
    return { title: this.title }
  },

  computed: {
    ...mapState('catalogue', ['items']),
    ...mapState('cart', { cartError: 'error' }),

    item: ({ items, entity }) => items.find((i) => i.id === entity.id),

    title: ({ entity }) => (entity.attributes || {}).title || 'Product',

    body: ({ entity }) => ((entity.attributes || {}).body || {}).processed || '',

    // Variation titles repeat the product's: "Gulliver's Travels - Hard copy".
    // The picker shows only what tells them apart.
    variations: ({ item, title }) => ((item || {}).variations || []).map((v) => ({
      ...v,
      label: (v.title || '').startsWith(`${title} - `) ? v.title.slice(title.length + 3) : v.title,
    })),

    variationLabel: ({ entity }) => (entity.type === 'product--media' ? 'Format · variation' : 'Option · variation'),

    activeVariation: ({ variations, activeVariationId }) =>
      variations.find((v) => v.id === activeVariationId) || variations[0],

    price: ({ activeVariation }) => (activeVariation || {}).price || '',

    images: ({ item }) => (item || {}).images || [],

    activeImage: ({ images, imageIndex }) => images[imageIndex] || images[0],

    meta: ({ activeVariation, entity, variations, item }) => [
      { label: 'SKU', value: (activeVariation || {}).sku || '–', mono: true },
      { label: 'Entity', value: entity.type, mono: true },
      { label: 'Variations', value: String(variations.length), mono: true },
      { label: 'Brand', value: (item || {}).brand || '–' },
    ],

    related: ({ items, item }) => (item
      ? items.filter((p) => p.id !== item.id && p.category === item.category).slice(0, 4)
      : []),
  },

  watch: {
    // A related product is the same route component with a new entity.
    'entity.id'() {
      this.activeVariationId = undefined
      this.imageIndex = 0
      this.added = false
    },
  },

  methods: {
    swipeStart(e) {
      this.touchX = e.changedTouches[0].clientX
    },

    swipeEnd(e) {
      const dx = e.changedTouches[0].clientX - this.touchX
      if (Math.abs(dx) < 40 || this.images.length < 2) return
      const n = this.images.length
      this.imageIndex = (this.imageIndex + (dx < 0 ? 1 : -1) + n) % n
    },

    async addToCart() {
      const v = this.activeVariation
      if (!v) return
      this.busy = true
      await this.$store.dispatch('cart/add', { type: v.type, id: v.id, quantity: 1 })
      this.busy = false
      this.added = !this.cartError
      setTimeout(() => { this.added = false }, 2400)
    },
  },
}
</script>
