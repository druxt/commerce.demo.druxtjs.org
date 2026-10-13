<template>
  <div class="mx-auto max-w-5xl px-5 py-12 flex flex-col gap-8">
    <header class="flex flex-wrap items-baseline justify-between gap-3">
      <h1 class="text-3xl">Your cart</h1>
      <p v-if="!isEmpty" class="label-mono">{{ count }} {{ count === 1 ? 'item' : 'items' }}</p>
    </header>

    <p v-if="error" class="card p-4 text-sm text-warn border-warn" role="alert">{{ error }}</p>

    <div v-if="$fetchState.pending" class="label-mono">Loading your cart…</div>

    <div v-else-if="isEmpty" class="card p-10 flex flex-col items-center gap-4 text-center">
      <p class="text-lg text-ink-2">Your cart is empty.</p>
      <NuxtLink to="/catalogue" class="btn-primary">Browse the catalogue</NuxtLink>
    </div>

    <template v-else>
      <ul class="card divide-y divide-line">
        <li
          v-for="line in lines"
          :key="line.id"
          class="p-4 md:p-5 flex flex-wrap items-center gap-4"
        >
          <div class="flex-1 min-w-40">
            <p class="font-600">{{ line.title }}</p>
            <p class="label-mono mt-1">{{ line.unitPrice }} each</p>
          </div>

          <div class="flex items-center border border-line rounded" role="group" :aria-label="`Quantity for ${line.title}`">
            <button
              type="button" class="w-11 h-11 text-lg hover:bg-paper-2 disabled:opacity-40"
              :disabled="busy" :aria-label="`Decrease quantity of ${line.title}`"
              @click="change(line, line.quantity - 1)"
            >&minus;</button>
            <span class="w-10 text-center tabular-nums" aria-live="polite">{{ line.quantity }}</span>
            <button
              type="button" class="w-11 h-11 text-lg hover:bg-paper-2 disabled:opacity-40"
              :disabled="busy" :aria-label="`Increase quantity of ${line.title}`"
              @click="change(line, line.quantity + 1)"
            >+</button>
          </div>

          <p class="w-24 text-right font-600 tabular-nums">{{ line.total }}</p>

          <button
            type="button" class="label-mono hover:text-ink disabled:opacity-40"
            :disabled="busy" @click="$store.dispatch('cart/remove', line)"
          >Remove</button>
        </li>
      </ul>

      <div class="flex flex-col items-end gap-4">
        <div class="w-full md:w-80 card p-5 flex flex-col gap-2">
          <div class="flex justify-between text-sm text-ink-2">
            <span>Subtotal</span><span class="tabular-nums">{{ subtotal || total }}</span>
          </div>
          <div class="flex justify-between text-lg font-600 pt-2 border-t border-line">
            <span>Total</span><span class="tabular-nums">{{ total }}</span>
          </div>
          <p class="label-mono mt-1">Shipping calculated at checkout</p>
        </div>

        <div class="flex flex-wrap gap-3">
          <NuxtLink to="/catalogue" class="btn-secondary">Keep shopping</NuxtLink>
          <NuxtLink to="/checkout" class="btn-primary">Checkout</NuxtLink>
        </div>
      </div>
    </template>

    <client-only>
      <DruxtDemoNote
        match="/jsonapi/carts"
        file="nuxt/store/cart.js"
        body="The cart is Drupal's order, read through commerce_api with the cart token this browser holds."
      />
    </client-only>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  name: 'CartPage',

  // The cart is a session-scoped thing on Drupal's side, so it is read in the
  // browser where the session cookie exists rather than during SSR.
  fetchOnServer: false,
  fetch() {
    return this.$store.dispatch('cart/load')
  },

  head: () => ({ title: 'Your cart' }),

  computed: {
    ...mapState('cart', ['lines', 'busy', 'error']),
    ...mapGetters('cart', ['count', 'total', 'subtotal', 'isEmpty']),
  },

  methods: {
    change(line, quantity) {
      return this.$store.dispatch('cart/setQuantity', { line, quantity })
    },
  },
}
</script>
