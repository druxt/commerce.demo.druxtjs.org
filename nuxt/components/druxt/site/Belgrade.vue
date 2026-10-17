<template>
  <div class="min-h-screen flex flex-col bg-paper-2">
    <!-- The demo bar from @druxt/demo, themed by components/druxt/demo/BarDefault.vue. -->
    <DruxtDemoBar :notice="liveNotice" />

    <header class="sticky top-0 z-40 bg-paper border-b border-line">
      <div class="wrap h-16 flex items-center gap-[clamp(12px,2.4vw,28px)]">
        <NuxtLink to="/" class="flex items-center gap-2.25 shrink-0 min-h-11" :aria-label="`${siteName}, home`">
          <DruxtMark class="w-6 h-18px" />
          <span class="text-16px font-700 tracking-tight">{{ siteName }}</span>
        </NuxtLink>

        <nav class="hidden md:flex items-center gap-5.5 text-14px font-500" aria-label="Main">
          <NuxtLink
            v-for="link in nav"
            :key="link.to"
            :to="link.to"
            class="py-1 border-b-2 border-transparent text-ink-2 hover:text-ink"
            :exact="link.exact"
            active-class="!text-ink !border-ink"
          >{{ link.label }}</NuxtLink>
        </nav>

        <div class="flex-1 min-w-0 flex justify-center">
          <SiteSearch class="hidden md:block max-w-380px" />
        </div>

        <button
          type="button"
          class="shrink-0 h-11 px-3.5 hidden md:inline-flex items-center gap-2 text-13px font-600 bg-paper border border-line rounded hover:border-ink"
          :aria-expanded="assistOpen ? 'true' : 'false'"
          @click="$store.dispatch('assist/openPanel')"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-teal" aria-hidden="true" />
          Assist
        </button>

        <!-- The cart is a drawer on every route; the page stays for the long view. -->
        <button
          type="button"
          class="shrink-0 h-11 min-w-11 px-3.5 flex items-center justify-center gap-2 text-13px font-600 bg-paper border border-line rounded hover:border-ink"
          :aria-label="cartLabel"
          :aria-expanded="cartOpen ? 'true' : 'false'"
          @click="$store.commit('cart/setDrawer', true)"
        >
          <span class="hidden md:inline">Cart</span>
          <svg class="md:hidden w-4 h-4 shrink-0" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 6h12l-1.2 10.5a1 1 0 0 1-1 .9H6.2a1 1 0 0 1-1-.9L4 6z" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M7.2 6a2.8 2.8 0 0 1 5.6 0" fill="none" stroke="currentColor" stroke-width="1.6" />
          </svg>
          <span class="font-mono text-11px bg-ink text-paper min-w-5 h-5 px-1.5 rounded-full inline-flex items-center justify-center">{{ cartCount }}</span>
        </button>
      </div>

      <div class="md:hidden px-3.5 pb-2.5">
        <SiteSearch id="site-search-small" />
      </div>
    </header>

    <main class="flex-1 w-full pb-16 md:pb-0">
      <slot name="content" />
    </main>

    <!-- The concierge and the cart, on every route. -->
    <client-only>
      <AssistPanel />
      <CartDrawer />
    </client-only>

    <footer class="bg-ink text-ink-3 mt-auto pb-16 md:pb-0">
      <div class="wrap py-9 flex flex-wrap gap-6 justify-between text-13px">
        <p>A DruxtJS demo. Drupal Commerce back end, Nuxt front end.</p>
        <a href="https://druxtjs.org" class="font-mono text-12px hover:text-paper">druxtjs.org</a>
      </div>
    </footer>

    <!-- Below 768px the navigation moves to the thumb. -->
    <nav class="tabbar md:hidden fixed inset-x-0 bottom-0 z-50 bg-paper border-t border-line flex" aria-label="Main">
      <NuxtLink
        v-for="link in nav"
        :key="link.to"
        :to="link.to"
        :exact="link.exact"
        class="flex-1 min-w-0 h-14 flex flex-col items-center justify-center gap-0.75 text-13px font-500 text-ink-2"
        active-class="tabbar__active"
      >
        <span>{{ link.label }}</span>
        <span class="tabbar__mark w-4.5 h-0.5" aria-hidden="true" />
      </NuxtLink>
      <button
        type="button"
        class="flex-1 min-w-0 h-14 flex flex-col items-center justify-center gap-0.75 text-13px font-500 text-ink-2 bg-transparent border-0"
        @click="$store.dispatch('assist/openPanel')"
      >
        <span>Assist</span>
        <span class="tabbar__mark w-4.5 h-0.5" aria-hidden="true" />
      </button>
    </nav>
  </div>
</template>

<script>
import { DruxtSiteMixin } from 'druxt-site'

export default {
  name: 'DruxtSiteBelgrade',

  mixins: [DruxtSiteMixin],

  data: () => ({
    settings: undefined,
    nav: [
      { to: '/', label: 'Home', exact: true },
      { to: '/catalogue', label: 'Catalogue' },
      { to: '/cart', label: 'Cart' },
    ],
  }),

  // Site name and slogan come from Drupal through decoupled_settings, so
  // editing them in Drupal changes the storefront with no frontend deploy.
  // Belgrade's own regions are deliberately not rendered: the chrome is the
  // storefront's, which is what makes it a decoupled build rather than a copy
  // of the Drupal theme.
  async fetch() {
    try {
      const res = await this.$druxt.axios.get('/jsonapi/decoupled/settings')
      this.settings = ((res.data || {}).data || {}).attributes || {}
    } catch (e) {
      // A storefront that cannot read its own name still has to render.
      this.settings = {}
    }
  },

  computed: {
    site: ({ settings }) => ((settings || {}).settings || {})['system.site'] || {},

    siteName: ({ site }) => site.name || 'Druxt Store',

    slogan: ({ site }) => site.slogan || 'Drupal Commerce Kickstart, served by Nuxt via Druxt',

    // The bar's one line.
    liveNotice: () => 'Live carts, live orders, a concierge on call. Fresh every day.',

    cartCount: ({ $store }) => $store.getters['cart/count'],

    cartLabel: ({ cartCount }) => (cartCount === 1 ? 'Cart, 1 item' : `Cart, ${cartCount} items`),

    assistOpen: ({ $store }) => $store.state.assist.open,

    cartOpen: ({ $store }) => $store.state.cart.drawer,
  },

  // The cart lives in the Drupal session, which only the browser carries.
  mounted() {
    this.$store.dispatch('cart/load')
  },
}
</script>

<style>
.tabbar {
  padding-bottom: env(safe-area-inset-bottom);
}
.tabbar__active {
  color: var(--ink);
  font-weight: 700;
}
.tabbar__active .tabbar__mark {
  background: var(--ink);
}
</style>
