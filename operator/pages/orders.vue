<template>
  <div>
    <template v-if="!code">
      <h1 class="h1">Orders</h1>
      <div class="card p-5 max-w-130">
        <p class="text-14px text-ink-2 leading-relaxed">
          A board lists one session's orders. <NuxtLink to="/">Start a session</NuxtLink> first.
        </p>
      </div>
    </template>

    <template v-else>
      <h1 class="h1">
        Orders
        <span class="live"><i class="dot" />live · session {{ code }}</span>
      </h1>
      <p class="lead">
        Every order placed in this session, as Drupal holds it. Moving one here moves the visitor's
        timeline within a second.
      </p>
      <p v-if="error" class="bg-err-1 border border-err-2 text-err-3 rounded px-3.5 py-3 text-14px mb-3.5" role="alert">{{ error }}</p>
      <div class="card">
        <p v-if="!orders.length" class="px-6 py-10 text-center text-14px text-ink-2 leading-relaxed">
          No orders in session {{ code }} yet.<br>
          The first checkout appears here within a second of being placed.
        </p>
        <template v-else>
          <div class="hidden md:grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3.5 px-4 min-h-9.5 items-center border-b border-line text-11px font-600 uppercase tracking-wider text-ink-2">
            <div>Order</div><div>Who</div><div>Placed</div><div>State</div><div>Total</div><div></div>
          </div>
          <OrderRow
            v-for="o in orders"
            :key="o.uuid"
            :order="o"
            :busy="!!busy[o.uuid]"
            :response="lastResponse[o.uuid] || null"
            @transition="move"
          />
        </template>
      </div>
    </template>
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'OrdersPage',

  head: () => ({ title: 'Orders' }),

  computed: {
    ...mapState('session', ['code', 'orders']),
    ...mapState('orders', ['busy', 'lastResponse', 'error']),
  },

  watch: {
    code: 'load',
  },

  mounted() {
    this.load()
    // Anything that moves an order in Drupal reaches the record, not only
    // what this console did.
    this.off = this.$sockets.on('content:changed', (m) => {
      if ((m.payload.tags || []).some((t) => t.startsWith('commerce_order'))) this.reload()
    })
    this.settle = setInterval(() => {
      for (const o of this.orders) if (o.isNew && Date.now() - o.placedAt > 10000) this.$store.commit('session/settle', o.uuid)
    }, 2000)
  },

  beforeDestroy() {
    if (this.off) this.off()
    clearInterval(this.settle)
    clearTimeout(this.timer)
  },

  methods: {
    load() {
      if (this.code) this.$store.dispatch('orders/load')
    },
    reload() {
      clearTimeout(this.timer)
      this.timer = setTimeout(this.load, 300)
    },
    move(payload) {
      this.$store.dispatch('orders/transition', payload)
    },
  },
}
</script>
