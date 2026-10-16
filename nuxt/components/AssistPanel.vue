<template>
  <transition name="assist">
    <aside
      v-if="open"
      ref="panel"
      class="fixed z-60 bg-paper flex flex-col inset-x-0 bottom-0 h-[86%] border-t border-line-2 shadow-[0_-18px_48px_rgba(16,18,20,0.16)] md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-100 md:border-t-0 md:border-l md:border-line md:shadow-[-18px_0_48px_rgba(16,18,20,0.12)]"
      role="dialog"
      aria-modal="true"
      aria-label="Assist"
      tabindex="-1"
      @keydown.esc="close"
    >
      <div class="md:hidden w-9 h-1 bg-line-2 mx-auto mt-2 rounded-full shrink-0" aria-hidden="true" />

      <header class="px-4.5 py-3.5 border-b border-line flex items-center gap-2.5 shrink-0">
        <span class="w-1.75 h-1.75 rounded-full shrink-0" :class="threadState === 'waiting' ? 'bg-warn animate-pulse' : 'bg-teal'" aria-hidden="true" />
        <div class="flex-1 min-w-0">
          <h2 class="text-15px font-700 tracking-tight">{{ withOperator ? `${operatorName} · operator` : 'Assist' }}</h2>
          <p class="font-mono text-11px text-ink-2">{{ mode }}</p>
        </div>
        <button type="button" class="h-9 px-2.5 border border-line rounded font-mono text-11px text-ink-2 hover:text-ink" @click="reset">reset</button>
        <button type="button" class="w-11 h-11 -mr-2.5 text-22px text-ink-2 hover:text-ink" aria-label="Close" @click="close">×</button>
      </header>

      <div ref="thread" class="flex-1 overflow-auto p-4.5 flex flex-col gap-4 bg-paper-3" aria-live="polite">
        <div v-for="(m, i) in messages" :key="i">
          <p v-if="m.role === 'sys'" class="font-mono text-11px text-ink-2 text-center leading-relaxed">{{ m.text }}</p>
          <div v-else-if="m.role === 'user'" class="ml-auto max-w-[88%] bg-ink text-paper text-14px leading-relaxed px-3.5 py-3 rounded">{{ m.text }}</div>
          <template v-else>
            <div class="max-w-[88%] bg-paper border border-line text-14px leading-relaxed px-3.5 py-3 rounded">
              <p v-if="m.who" class="font-mono text-10px tracking-widest uppercase text-teal mb-1.5">{{ m.who }}</p>
              {{ m.text }}
            </div>
            <div v-if="m.chips" class="flex flex-wrap gap-1.75 mt-2.5">
              <button
                v-for="chip in m.chips"
                :key="chip"
                type="button"
                class="min-h-11 px-3 bg-paper border rounded text-13px inline-flex items-center gap-1.5"
                :class="chip === 'Talk to a person' ? (canTalk ? 'border-ink font-600' : 'border-line-2 border-dashed text-ink-2 cursor-not-allowed') : 'border-line-2 hover:border-ink'"
                :disabled="chip === 'Talk to a person' && !canTalk"
                :title="chip === 'Talk to a person' && !canTalk ? 'Our people join during live demos.' : null"
                @click="chip === 'Talk to a person' ? talk() : ask(chip)"
              >{{ chip }}</button>
            </div>
            <div v-if="m.picks && m.picks.length" class="flex flex-col gap-2 mt-3">
              <div v-for="pick in resolved(m.picks)" :key="pick.sku" class="flex items-center gap-2.75 bg-paper border border-line p-2.25 rounded">
                <img v-if="pick.image" :src="pick.image" alt="" class="w-13 h-13 object-cover shrink-0">
                <span v-else class="w-13 h-13 bg-paper-3 shrink-0" aria-hidden="true" />
                <div class="flex-1 min-w-0">
                  <NuxtLink :to="pick.path" class="block text-13px font-600 leading-tight hover:underline" @click.native="close">{{ pick.title }}</NuxtLink>
                  <p class="text-11px text-ink-2 leading-snug mt-0.5">{{ pick.why }}</p>
                </div>
                <div class="flex flex-col items-end gap-1.25 shrink-0">
                  <span class="font-mono text-13px font-500">{{ pick.price }}</span>
                  <button
                    type="button"
                    class="h-11 min-w-14 px-2.5 border border-ink rounded bg-paper text-11px font-600 hover:bg-ink hover:text-paper disabled:opacity-50"
                    :disabled="busy"
                    :aria-label="`Add ${pick.title} to cart`"
                    @click="add(pick)"
                  >{{ added === pick.sku ? 'Added' : 'Add' }}</button>
                </div>
              </div>
              <button
                type="button"
                class="self-start min-h-11 inline-flex items-center text-13px font-600 rounded"
                :class="showing(m.picks) ? 'px-3 bg-teal/10 text-teal border border-teal/40' : 'text-accent'"
                @click="show(m.picks)"
              >{{ showing(m.picks) ? `Showing these ${m.picks.length} in the catalogue` : 'Show these in the catalogue →' }}</button>
            </div>
          </template>
        </div>
        <p v-if="pending" class="font-mono text-11px text-ink-2 animate-pulse">thinking…</p>
        <!-- Waiting for a person: the session's consoles have the thread. -->
        <div v-if="threadState === 'waiting'" class="bg-paper border border-line p-3.5 rounded flex flex-col gap-2.5 items-start">
          <p class="flex items-center gap-2 font-mono text-12px">
            <span class="w-1.75 h-1.75 rounded-full bg-warn animate-pulse" aria-hidden="true" />
            Waiting for an operator · {{ waited }}
          </p>
          <p class="text-12px text-ink-2 leading-relaxed">The operators on this session see this thread as it is. The first to pick it up sees everything above.</p>
          <button type="button" class="min-h-11 px-3 bg-paper border border-line-2 rounded text-13px" @click="$store.dispatch('assist/cancelWait')">Cancel, keep the concierge</button>
        </div>
      </div>

      <p v-if="!canTalk" class="px-4.5 py-2.5 border-t border-line bg-paper text-12px text-ink-2 leading-relaxed shrink-0">
        Concierge on duty. Our people join during live demos.
      </p>

      <form class="border-t border-line p-3 flex gap-2 bg-paper shrink-0" @submit.prevent="send">
        <input
          ref="input"
          v-model="draft"
          class="flex-1 min-w-0 h-11 px-3 text-16px bg-paper-3 border border-line rounded text-ink focus:border-ink focus:outline-none"
          :placeholder="withOperator ? `Reply to ${operatorName}` : 'Describe what you are after'"
          aria-label="Your message"
          autocomplete="off"
        >
        <button type="submit" class="h-11 px-4 bg-ink text-paper rounded text-13px font-600 disabled:opacity-50" :disabled="pending || !draft.trim()">Send</button>
      </form>
    </aside>
  </transition>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  name: 'AssistPanel',

  data: () => ({ draft: '', added: '', busy: false, now: Date.now(), ticker: null }),

  computed: {
    ...mapState('assist', ['open', 'pending', 'messages', 'picksShown', 'threadState', 'operatorName', 'waitingSince']),
    ...mapGetters('assist', ['productCount', 'withOperator']),
    ...mapState('catalogue', ['items']),

    // A person is only reachable on a demo session.
    canTalk: ({ $live }) => !!($live && $live.session),

    mode: ({ threadState, productCount }) =>
      ({
        waiting: 'handing over · concierge paused',
        with_operator: 'operator present · concierge paused',
      })[threadState] || `concierge · ${productCount} products indexed`,

    waited: ({ waitingSince, now }) => {
      const s = Math.max(0, Math.round((now - waitingSince) / 1000))
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    },
  },

  watch: {
    async open(on) {
      if (on) {
        const opening = (this.opening = {})
        this.opened = document.activeElement
        await this.$store.dispatch('catalogue/load')
        // Closed, or closed and opened again, while the catalogue loaded.
        if (!this.open || this.opening !== opening) return
        await this.$nextTick()
        this.$refs.input && this.$refs.input.focus()
        document.addEventListener('focusin', this.trap)
        document.addEventListener('keydown', this.onKey)
      } else {
        document.removeEventListener('focusin', this.trap)
        document.removeEventListener('keydown', this.onKey)
        if (this.opened && this.opened.focus) this.opened.focus()
      }
    },
    // The answer came: the input takes focus back for the next question.
    pending(on) {
      if (!on && this.open) this.$nextTick(() => this.$refs.input && this.$refs.input.focus())
    },
    messages() {
      this.$nextTick(() => {
        const el = this.$refs.thread
        if (el) el.scrollTop = el.scrollHeight
      })
    },
  },

  mounted() {
    this.ticker = setInterval(() => (this.now = Date.now()), 1000)
  },

  beforeDestroy() {
    document.removeEventListener('focusin', this.trap)
    document.removeEventListener('keydown', this.onKey)
    clearInterval(this.ticker)
  },

  methods: {
    close() {
      this.$store.dispatch('assist/closePanel')
    },
    reset() {
      this.$store.dispatch('assist/reset')
    },
    send() {
      const text = this.draft
      this.draft = ''
      this.ask(text)
    },
    ask(text) {
      return this.$store.dispatch('assist/ask', text)
    },
    talk() {
      this.$store.dispatch('assist/talk')
    },

    // A pick's SKU names a variation; the catalogue store knows its product.
    resolved(picks) {
      return picks
        .map((p) => {
          const product = this.items.find((i) => i.variations.some((v) => v.sku === p.sku))
          const variation = product && product.variations.find((v) => v.sku === p.sku)
          return product
            ? { sku: p.sku, why: p.why, title: product.title, path: product.path, image: product.image, price: variation.price, variation }
            : null
        })
        .filter(Boolean)
    },

    async add(pick) {
      this.busy = true
      await this.$store.dispatch('cart/add', { type: pick.variation.type, id: pick.variation.id, quantity: 1, title: pick.title })
      this.busy = false
      this.added = pick.sku
      setTimeout(() => (this.added = ''), 1600)
    },

    show(picks) {
      this.$store.dispatch('assist/showPicks', picks.map((p) => p.sku))
      if (window.innerWidth < 768) this.close()
    },

    showing(picks) {
      const shown = this.picksShown
      return shown.length && picks.every((p) => shown.includes(p.sku)) && this.$route.path === '/catalogue' && this.$route.query.picks
    },

    // Escape closes from anywhere on the page while the panel is open.
    onKey(event) {
      if (event.key === 'Escape') this.close()
    },

    // Keep focus inside the dialog while it is open.
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
.assist-enter-active,
.assist-leave-active {
  transition: transform 180ms ease, opacity 180ms ease;
}
.assist-enter,
.assist-leave-to {
  opacity: 0;
  transform: translateY(16px);
}
@media (min-width: 768px) {
  .assist-enter,
  .assist-leave-to {
    transform: translateX(16px);
  }
}
</style>
