<template>
  <div class="min-h-screen flex flex-col bg-paper-2">
    <!-- The demo's whole argument is which half is which, so it says so. -->
    <div class="bg-ink text-ink-3 font-mono text-11px">
      <div class="mx-auto max-w-7xl px-5 py-2 flex flex-wrap gap-x-3 gap-y-1 justify-center text-center">
        <span>commerce.demo.druxtjs.org</span>
        <span class="text-ink-2" aria-hidden="true">/</span>
        <span class="text-paper">{{ slogan }}</span>
      </div>
    </div>

    <header class="bg-paper border-b border-line sticky top-0 z-20">
      <div class="mx-auto max-w-7xl px-5 h-16 flex items-center gap-6">
        <NuxtLink to="/" class="flex items-center gap-2.5 shrink-0">
          <img v-if="logo" :src="logo" alt="" class="h-7 w-7" width="28" height="28">
          <span class="text-lg font-700 tracking-tight">{{ siteName }}</span>
        </NuxtLink>

        <nav class="hidden md:flex items-center gap-5 text-sm" aria-label="Main">
          <NuxtLink
            v-for="link in nav"
            :key="link.to"
            :to="link.to"
            class="py-1 border-b-2 border-transparent hover:border-ink"
            active-class="border-ink font-600"
          >{{ link.label }}</NuxtLink>
        </nav>

        <div class="flex-1" />

        <NuxtLink to="/cart" class="btn-secondary shrink-0" :aria-label="cartLabel">
          Cart
          <span class="font-mono text-11px bg-paper-2 border border-line rounded px-1.5 py-0.5 tabular-nums">{{ cartCount }}</span>
        </NuxtLink>
      </div>

      <nav class="md:hidden border-t border-line px-5 py-2 flex gap-4 text-sm overflow-x-auto" aria-label="Main, small screen">
        <NuxtLink v-for="link in nav" :key="link.to" :to="link.to" class="whitespace-nowrap py-1">{{ link.label }}</NuxtLink>
      </nav>
    </header>

    <main class="flex-1">
      <slot name="content" />
    </main>

    <footer class="bg-ink text-ink-3 mt-16">
      <div class="mx-auto max-w-7xl px-5 py-8 flex flex-wrap gap-4 justify-between items-center text-13px">
        <p>A DruxtJS demo. Drupal Commerce back end, Nuxt front end.</p>
        <a href="https://druxtjs.org" class="font-mono text-11px hover:text-paper">druxtjs.org</a>
      </div>
    </footer>
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
      { to: '/', label: 'Home' },
      { to: '/catalogue', label: 'Catalogue' },
      { to: '/cart', label: 'Cart' },
    ],
  }),

  // Site name, slogan and theme logo come from Drupal through
  // decoupled_settings, so editing them in Drupal changes the storefront with
  // no frontend deploy. Belgrade's own regions are deliberately not rendered:
  // the chrome is the storefront's, which is what makes it a decoupled build
  // rather than a copy of the Drupal theme.
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

    // Named for what it is: the active theme's settings from Drupal. `theme`
    // itself is a prop on DruxtSiteMixin, carrying the theme id.
    themeSettings: ({ settings }) => {
      const all = (settings || {}).settings || {}
      const key = Object.keys(all).find((k) => k.endsWith('.settings'))
      return key ? all[key] : {}
    },

    siteName: ({ site }) => site.name || 'Druxt Store',

    slogan: ({ site }) => site.slogan || 'Drupal Commerce Kickstart, served by Nuxt via Druxt',

    logo: ({ themeSettings }) => ((themeSettings || {}).logo || {}).url || undefined,

    cartCount: ({ $store }) => ((($store.state || {}).cart || {}).lines || []).length,

    cartLabel: ({ cartCount }) =>
      cartCount === 1 ? 'Cart, 1 item' : `Cart, ${cartCount} items`,
  },
}
</script>
