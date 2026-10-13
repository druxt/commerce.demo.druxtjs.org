<template>
  <article class="mx-auto max-w-7xl px-5 py-10">
    <nav class="label-mono mb-6 flex gap-2" aria-label="Breadcrumb">
      <NuxtLink to="/" class="hover:text-ink">Home</NuxtLink>
      <span aria-hidden="true">/</span>
      <NuxtLink to="/catalogue" class="hover:text-ink">Catalogue</NuxtLink>
    </nav>

    <div class="grid gap-10 lg:grid-cols-2">
      <!-- Gallery -->
      <div class="flex flex-col gap-3">
        <div class="card overflow-hidden aspect-square bg-paper-3">
          <img
            v-if="activeImage"
            :src="activeImage.url"
            :alt="activeImage.alt || title"
            class="w-full h-full object-cover"
          >
          <div v-else class="w-full h-full flex items-center justify-center label-mono">
            no image
          </div>
        </div>

        <div v-if="images.length > 1" class="flex gap-3 flex-wrap">
          <button
            v-for="(img, i) in images"
            :key="img.url"
            type="button"
            class="w-16 h-16 card overflow-hidden p-0"
            :class="i === imageIndex ? 'border-ink' : 'border-line hover:border-line-2'"
            :aria-label="`Show image ${i + 1} of ${images.length}`"
            :aria-pressed="i === imageIndex ? 'true' : 'false'"
            @click="imageIndex = i"
          >
            <img :src="img.url" :alt="''" class="w-full h-full object-cover">
          </button>
        </div>
      </div>

      <!-- Detail -->
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-3">
          <p v-if="collections.length" class="label-mono">{{ collections.join(' · ') }}</p>
          <h1 class="text-3xl sm:text-4xl">{{ title }}</h1>
          <p v-if="price" class="text-2xl font-600 tabular-nums">{{ price }}</p>
        </div>

        <!-- Variations. Hidden entirely when there is only one. -->
        <fieldset v-if="variations.length > 1" class="border-0 p-0 m-0 flex flex-col gap-2">
          <legend class="label-mono mb-1">Options</legend>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="v in variations"
              :key="v.id"
              type="button"
              class="btn"
              :class="v.id === activeVariationId ? 'bg-ink text-paper border-ink' : 'bg-paper border-line-2 hover:border-ink'"
              :aria-pressed="v.id === activeVariationId ? 'true' : 'false'"
              @click="activeVariationId = v.id"
            >{{ v.title }}</button>
          </div>
        </fieldset>

        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <label class="label-mono" for="qty">Quantity</label>
            <input
              id="qty"
              v-model.number="qty"
              type="number"
              min="1"
              max="99"
              class="field w-20 tabular-nums"
            >
          </div>

          <button
            type="button"
            class="btn-primary w-full sm:w-auto"
            :disabled="!canAddToCart"
            :class="!canAddToCart && 'opacity-50 cursor-not-allowed'"
            @click="addToCart"
          >
            {{ added ? 'Added to cart' : 'Add to cart' }}
          </button>

          <p v-if="!canAddToCart" class="text-13px text-warn">
            {{ unavailableReason }}
          </p>

          <p v-if="sku" class="label-mono">SKU {{ sku }}</p>
        </div>

        <div v-if="body" class="prose text-ink-2 border-t border-line pt-6" v-html="body" />

        <p class="label-mono border-t border-line pt-4">
          Rendered by Druxt from product--physical
        </p>
      </div>
    </div>
  </article>
</template>

<script>
import { DrupalJsonApiParams } from 'drupal-jsonapi-params'

export default {
  name: 'DruxtEntityProductPhysicalFull',

  props: {
    entity: { type: Object, required: true },
  },

  data: () => ({
    activeVariationId: undefined,
    imageIndex: 0,
    qty: 1,
    added: false,
    // DruxtEntity fetches the product, not its references, so variations,
    // images and terms are loaded here in one request rather than read out of
    // a store bucket that was never populated.
    related: [],
  }),

  async fetch() {
    const collection = await this.$store.dispatch('druxt/getCollection', {
      type: this.entity.type,
      query: new DrupalJsonApiParams()
        .addFilter('id', this.entity.id)
        .addInclude(['variations', 'images', 'product_collections']),
    })
    this.related = collection.included || []
  },

  head() {
    return { title: this.title }
  },

  computed: {
    title: ({ entity }) => (entity.attributes || {}).title || 'Product',

    body: ({ entity }) => ((entity.attributes || {}).body || {}).processed || '',


    variations() {
      const rels = ((this.entity.relationships || {}).variations || {}).data || []
      return rels
        .map((r) => this.resource(r))
        .filter(Boolean)
        .map((v) => ({
          id: v.id,
          // commerce_api addresses a variation by resource type as well as id.
          type: v.type,
          title: (v.attributes || {}).title || 'Option',
          sku: (v.attributes || {}).sku,
          price: (v.attributes || {}).price,
        }))
    },

    activeVariation() {
      if (!this.variations.length) return undefined
      return this.variations.find((v) => v.id === this.activeVariationId) || this.variations[0]
    },

    // Drupal owns currency, rounding and locale. The formatted string is used
    // as given rather than composed from number and currency_code.
    price: ({ activeVariation }) => ((activeVariation || {}).price || {}).formatted || '',

    sku: ({ activeVariation }) => (activeVariation || {}).sku || '',

    images() {
      const rels = ((this.entity.relationships || {}).images || {}).data || []
      return rels
        .map((r) => this.resource(r))
        .filter(Boolean)
        .map((f) => ({
          url: ((f.attributes || {}).uri || {}).url,
          alt: '',
        }))
        .filter((i) => !!i.url)
    },

    activeImage: ({ images, imageIndex }) => images[imageIndex] || images[0],

    collections() {
      const rels = ((this.entity.relationships || {}).product_collections || {}).data || []
      return rels
        .map((r) => this.resource(r))
        .filter(Boolean)
        .map((t) => (t.attributes || {}).name)
        .filter(Boolean)
    },

    canAddToCart: ({ activeVariation }) => !!activeVariation,

    unavailableReason: () => 'This product has no purchasable option.',
  },

  methods: {
    // Resolve one of the entity's references from the included resources
    // fetched alongside it.
    resource(ref) {
      if (!ref || !ref.type || !ref.id) return undefined
      return (this.related || []).find((r) => r.type === ref.type && r.id === ref.id)
    },

    async addToCart() {
      const v = this.activeVariation
      if (!v) return
      await this.$store.dispatch('cart/add', {
        type: v.type,
        id: v.id,
        quantity: this.qty,
      })
      this.added = true
      setTimeout(() => { this.added = false }, 2000)
    },
  },
}
</script>
