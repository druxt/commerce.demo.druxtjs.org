<template>
  <!-- The demo's whole argument is which half is which, so it says so. -->
  <div class="bg-ink text-paper-2 font-mono text-11px tracking-wide min-h-30px px-4 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 text-center">
    <span class="text-ink-3">commerce.demo.druxtjs.org</span>
    <span class="hidden md:inline text-ink-2" aria-hidden="true">/</span>
    <span class="hidden md:inline">{{ notice }}</span>
    <span class="hidden md:inline text-ink-2" aria-hidden="true">/</span>
    <a v-if="source" :href="source" rel="noopener" target="_blank" class="text-paper hover:text-mint">source</a>
    <!-- A demo session this tab joined through its link. -->
    <span v-if="session" class="inline-flex items-center gap-1.5 text-mint" :title="`Demo session ${session}: an operator's console sees the orders placed here`">
      <span class="w-1.5 h-1.5 rounded-full bg-mint" aria-hidden="true" />session {{ session }}
    </span>
    <button
      type="button"
      role="switch"
      :aria-checked="overlay ? 'true' : 'false'"
      class="min-h-30px inline-flex items-center gap-1.5 text-paper hover:text-mint"
      @click="$druxtDemo.toggleOverlay()"
    >
      overlay
      <span class="relative w-7 h-4 rounded-full border border-current" aria-hidden="true">
        <span
          class="absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full bg-current transition-transform duration-150"
          :class="overlay && 'translate-x-3'"
        />
      </span>
    </button>
  </div>
</template>

<script>
export default {
  name: 'DruxtDemoBarDefault',

  props: {
    source: { type: String, default: '' },
    docs: { type: String, default: '' },
    discord: { type: String, default: '' },
    notice: { type: String, default: '' },
    overlay: { type: Boolean, default: false },
  },

  // The badge is browser state, read once this theme has hydrated. The bar's
  // theme resolves after the page is ready, so reading it any earlier puts a
  // badge in the browser's tree that the server's markup does not have.
  data: () => ({ ready: false }),

  mounted() {
    this.ready = true
  },

  computed: {
    session: ({ ready, $druxtDemo }) => (ready && ($druxtDemo || {}).session) || '',
  },
}
</script>
