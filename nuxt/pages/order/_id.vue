<template>
  <div class="wrap pt-6 pb-18 max-w-3xl">
    <header class="mb-6">
      <p class="font-mono text-11px tracking-widest uppercase text-ink-2 mb-2">Order</p>
      <h1 class="text-[clamp(24px,4vw,30px)]">{{ order ? `#${order.order_number}` : 'Your order' }}</h1>
    </header>

    <p v-if="$fetchState.pending" class="font-mono text-13px text-ink-2">Reading the order from Drupal…</p>

    <div v-else-if="error" class="border border-line bg-paper p-6">
      <p class="text-15px font-600 mb-1">This order is not yours to see.</p>
      <p class="text-14px text-ink-2">
        Drupal keeps an order readable by the browser that placed it. This one was placed from
        another browser, or the demo has been reset since.
      </p>
      <NuxtLink to="/catalogue" class="inline-block mt-4 text-accent font-600">Back to the catalogue</NuxtLink>
    </div>

    <template v-else-if="order">
      <!-- Where the order is in Commerce's workflow. -->
      <ol class="flex flex-wrap gap-2 mb-8" aria-label="Order progress">
        <li
          v-for="(s, i) in steps"
          :key="s.id"
          class="flex items-center gap-2 h-11 px-3.5 border rounded font-mono text-12px"
          :class="i <= reached ? 'border-ink bg-paper text-ink' : 'border-line text-ink-2'"
          :aria-current="i === reached ? 'step' : null"
        >
          <span class="w-2 h-2 rounded-full" :class="i <= reached ? 'bg-ink' : 'bg-line-2'" aria-hidden="true" />
          {{ s.label }}
        </li>
      </ol>

      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-14px border border-line bg-paper p-5 mb-6">
        <dt class="font-mono text-11px uppercase tracking-wider text-ink-2 self-center">State</dt>
        <dd class="m-0 font-mono">{{ order.state }}</dd>
        <dt class="font-mono text-11px uppercase tracking-wider text-ink-2 self-center">Total</dt>
        <dd class="m-0 font-mono">{{ (order.total_price || {}).formatted }}</dd>
        <dt class="font-mono text-11px uppercase tracking-wider text-ink-2 self-center">Email</dt>
        <dd class="m-0">{{ order.email }}</dd>
        <dt class="font-mono text-11px uppercase tracking-wider text-ink-2 self-center">Paid</dt>
        <dd class="m-0 font-mono">{{ (order.total_paid || {}).formatted || '–' }}</dd>
      </dl>

      <DruxtDemoNote
        match="/jsonapi/checkout/"
        file="nuxt/pages/order/_id.vue"
        body="Drupal's own order, read through commerce_api's checkout resource. It stays readable by the browser that placed it, and only that browser."
      />
      <DruxtDemoDrawer :path="`/jsonapi/checkout/${$route.params.id}`" class="mt-4" />
    </template>
  </div>
</template>

<script>
// The order's workflow in plain words. Commerce's fulfilment workflow:
// draft, fulfillment, completed, with canceled aside.
const STEPS = [
  { id: 'draft', label: 'Placed' },
  { id: 'fulfillment', label: 'Being fulfilled' },
  { id: 'completed', label: 'Completed' },
]

export default {
  name: 'OrderPage',

  // The read depends on the session the browser holds, so it happens there.
  fetchOnServer: false,

  data: () => ({ order: null, error: '' }),

  async fetch() {
    try {
      const body = await this.$store.dispatch('cart/order', this.$route.params.id)
      this.order = { id: body.data.id, ...body.data.attributes }
      this.error = ''
    } catch (e) {
      this.order = null
      this.error = e.message
    }
  },

  head() {
    return { title: this.order ? `Order #${this.order.order_number}` : 'Order' }
  },

  computed: {
    steps: () => STEPS,

    reached: ({ order }) => {
      if (!order) return -1
      if (order.state === 'canceled') return -1
      const i = STEPS.findIndex((s) => s.id === order.state)
      // A placed order's state is already past draft.
      return i === -1 ? 1 : Math.max(i, 1)
    },
  },
}
</script>
