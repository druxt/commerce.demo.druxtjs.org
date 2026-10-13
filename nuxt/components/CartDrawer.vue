<template>
  <transition name="drawer">
    <aside
      v-if="open"
      ref="panel"
      class="fixed z-60 bg-paper flex flex-col inset-x-0 bottom-0 max-h-[86%] border-t border-line-2 shadow-[0_-18px_48px_rgba(16,18,20,0.16)] md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-105 md:border-t-0 md:border-l md:border-line md:shadow-[-18px_0_48px_rgba(16,18,20,0.12)]"
      role="dialog"
      aria-modal="true"
      aria-label="Cart"
      tabindex="-1"
    >
      <div class="md:hidden w-9 h-1 bg-line-2 mx-auto mt-2 rounded-full shrink-0" aria-hidden="true" />

      <header class="px-4.5 py-3.5 border-b border-line flex items-center gap-2.5 shrink-0">
        <div class="flex-1 min-w-0">
          <h2 class="text-15px font-700 tracking-tight">{{ room.code && room.guest ? `Cart · with ${ownerName}` : 'Your cart' }}</h2>
          <p class="font-mono text-11px text-ink-2">
            {{ count }} {{ count === 1 ? 'item' : 'items' }}
            <template v-if="room.code"> · shared with {{ others.length }} {{ others.length === 1 ? 'other' : 'others' }}</template>
            <template v-else> · Drupal's order, live</template>
          </p>
        </div>
        <NuxtLink to="/cart" class="h-9 px-2.5 border border-line rounded font-mono text-11px text-ink-2 hover:text-ink inline-flex items-center" @click.native="close">cart page</NuxtLink>
        <button ref="closeButton" type="button" class="w-11 h-11 -mr-2.5 text-22px text-ink-2 hover:text-ink" aria-label="Close" @click="close">×</button>
      </header>

      <div class="flex-1 overflow-auto bg-paper-3" aria-live="polite">
        <p v-if="error" class="m-4 p-3 text-sm text-warn border border-warn bg-paper rounded" role="alert">{{ error }}</p>
        <div v-if="isEmpty" class="p-8 text-center flex flex-col items-center gap-3">
          <p class="text-15px text-ink-2">Your cart is empty.</p>
          <NuxtLink to="/catalogue" class="btn-primary" @click.native="close">Browse the catalogue</NuxtLink>
        </div>
        <ul v-else class="divide-y divide-line bg-paper">
          <li v-for="line in lines" :key="line.id" class="p-4 flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-14px font-600 leading-tight">{{ line.title }}</p>
              <p class="font-mono text-11px text-ink-2 mt-1">{{ line.unitPrice }} each</p>
              <p v-if="room.added[line.title]" class="font-mono text-11px text-teal mt-0.5">
                added by {{ room.added[line.title] === room.you ? 'you' : room.names[room.added[line.title]] || 'someone' }}
              </p>
            </div>
            <div class="flex items-center border border-line rounded" role="group" :aria-label="`Quantity for ${line.title}`">
              <button type="button" class="w-10 h-10 hover:bg-paper-2 disabled:opacity-40" :disabled="busy" :aria-label="`Decrease quantity of ${line.title}`" @click="change(line, line.quantity - 1)">&minus;</button>
              <span class="w-8 text-center tabular-nums text-14px">{{ line.quantity }}</span>
              <button type="button" class="w-10 h-10 hover:bg-paper-2 disabled:opacity-40" :disabled="busy" :aria-label="`Increase quantity of ${line.title}`" @click="change(line, line.quantity + 1)">+</button>
            </div>
            <p class="w-18 text-right font-600 tabular-nums text-14px">{{ line.total }}</p>
          </li>
        </ul>
        <p v-if="room.lastChange && recent" class="m-4 inline-flex items-center gap-2 bg-ink text-paper text-12px px-3 py-2 rounded">
          <span class="w-1.5 h-1.5 rounded-full bg-mint" aria-hidden="true" />
          {{ room.lastChange.byName }} {{ (room.lastChange.what || {}).verb || 'changed' }} {{ (room.lastChange.what || {}).title || 'the cart' }}
        </p>
      </div>

      <footer v-if="!isEmpty" class="border-t border-line p-4 flex flex-col gap-3 bg-paper shrink-0">
        <div class="flex justify-between text-16px font-600">
          <span>Total</span><span class="tabular-nums">{{ total }}</span>
        </div>
        <p class="label-mono">Shipping calculated at checkout</p>
        <div class="flex gap-2.5">
          <NuxtLink to="/cart" class="btn-secondary flex-1" @click.native="close">{{ room.code ? 'The room' : 'Shop together' }}</NuxtLink>
          <span v-if="room.closed" class="btn-primary flex-1 opacity-50 cursor-default" aria-disabled="true">Checked out</span>
          <NuxtLink v-else to="/checkout" class="btn-primary flex-1" @click.native="close">Checkout</NuxtLink>
        </div>
      </footer>
    </aside>
  </transition>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

// The cart in the layout: the same store the cart page reads, so a line
// added from a card, the concierge or someone else's phone in a shared room
// shows here on whatever route is open, with no reload.
export default {
  name: 'CartDrawer',

  data: () => ({ now: Date.now(), timer: null }),

  computed: {
    ...mapState('cart', ['lines', 'busy', 'error']),
    ...mapGetters('cart', ['count', 'total', 'isEmpty']),

    open: ({ $store }) => $store.state.cart.drawer,

    room: ({ $live }) => ($live && $live.room) || { code: '', guest: false, members: [], names: {}, added: {}, closed: null, you: '', lastChange: null },

    others: ({ room }) => room.members.filter((m) => m.id !== room.you),

    ownerName: ({ room }) => room.names[room.owner] || 'someone',

    recent: ({ room, now }) => room.lastChange && now - room.lastChange.at < 10000,
  },

  watch: {
    open(on) {
      if (on) {
        this.opened = document.activeElement
        this.$nextTick(() => this.$refs.closeButton && this.$refs.closeButton.focus())
        document.addEventListener('focusin', this.trap)
        document.addEventListener('keydown', this.onKey)
        this.timer = setInterval(() => (this.now = Date.now()), 2000)
      } else {
        document.removeEventListener('focusin', this.trap)
        document.removeEventListener('keydown', this.onKey)
        clearInterval(this.timer)
        if (this.opened && this.opened.focus) this.opened.focus()
      }
    },
    // A new route closes it; the page it opened on is gone.
    $route() {
      this.close()
    },
  },

  beforeDestroy() {
    document.removeEventListener('focusin', this.trap)
    document.removeEventListener('keydown', this.onKey)
    clearInterval(this.timer)
  },

  methods: {
    close() {
      if (this.open) this.$store.commit('cart/setDrawer', false)
    },
    change(line, quantity) {
      return this.$store.dispatch('cart/setQuantity', { line, quantity })
    },
    onKey(event) {
      if (event.key === 'Escape') this.close()
    },
    // Keep focus inside the dialog while it is open, as the assist panel does.
    trap(event) {
      const panel = this.$refs.panel
      if (panel && !panel.contains(event.target)) {
        const first = panel.querySelector('button, input, a[href]')
        if (first) first.focus()
      }
    },
  },
}
</script>

<style>
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 180ms ease, opacity 180ms ease;
}
.drawer-enter,
.drawer-leave-to {
  opacity: 0;
  transform: translateY(16px);
}
@media (min-width: 768px) {
  .drawer-enter,
  .drawer-leave-to {
    transform: translateX(16px);
  }
}
</style>
