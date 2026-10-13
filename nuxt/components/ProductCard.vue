<template>
  <article class="product-card relative flex flex-col bg-paper border border-line">
    <div class="relative overflow-hidden bg-paper-3" :class="wide ? 'aspect-[4/3]' : 'aspect-square'">
      <img v-if="image" :src="image" alt="" loading="lazy" class="w-full h-full object-cover">
      <!-- A product with no image still holds its space, so the grid does not
           reflow around it. -->
      <span v-else class="absolute left-2.5 bottom-2.5 font-mono text-10px text-ink-3 bg-paper px-1.5 py-0.5">no image</span>
    </div>

    <div class="flex flex-col gap-1.5 flex-1 p-3.5">
      <p v-if="category" class="font-mono text-10px tracking-wider uppercase text-ink-3">{{ category }}</p>
      <h3 class="text-15px font-600 leading-tight flex-1">
        <!-- The link covers the card, so the whole card is one target and the
             Add button still sits above it. -->
        <NuxtLink :to="path" class="after:content-empty after:absolute after:inset-0">{{ title }}</NuxtLink>
      </h3>
      <div class="flex items-center justify-between gap-2">
        <span v-if="price" class="font-mono text-14px font-500">{{ price }}</span>
        <button
          v-if="variation"
          type="button"
          class="card-add relative z-1 h-7 px-2.5 font-600 text-12px border border-ink rounded bg-paper hover:bg-ink hover:text-paper transition-colors duration-150 disabled:opacity-50"
          :disabled="adding"
          :aria-label="`Add ${title} to cart`"
          @click="add"
        >{{ added ? 'Added' : 'Add' }}</button>
      </div>
    </div>
  </article>
</template>

<script>
export default {
  name: 'ProductCard',

  props: {
    title: { type: String, required: true },
    path: { type: String, required: true },
    // Drupal's formatted price string, used as given. Commerce owns currency,
    // rounding and locale.
    price: { type: String, default: '' },
    image: { type: String, default: '' },
    category: { type: String, default: '' },
    // 4:3 on the home grid, square in the catalogue.
    wide: { type: Boolean, default: false },
    // A variation to add straight from the card. Without one there is no button.
    variation: { type: Object, default: undefined },
  },

  data: () => ({ adding: false, added: false }),

  methods: {
    async add() {
      this.adding = true
      await this.$store.dispatch('cart/add', { type: this.variation.type, id: this.variation.id, quantity: 1 })
      this.adding = false
      if (this.$store.state.cart.error) return
      this.added = true
      setTimeout(() => { this.added = false }, 1600)
    },
  },
}
</script>

<style>
.product-card {
  transition: border-color 140ms ease, transform 140ms ease;
}
/* Drawn at 28px to the design, hit at 44px so it stays a touch target. */
.card-add::after {
  content: '';
  position: absolute;
  inset: -8px -4px;
}
.product-card:hover {
  border-color: var(--ink);
  transform: translateY(-2px);
}
</style>
