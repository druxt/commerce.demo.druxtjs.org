<template>
  <div>
    <!-- No session yet: the one thing to do. -->
    <template v-if="!code">
      <h1 class="h1">Start a session</h1>
      <p class="lead">
        A session scopes everything on this console: the orders and presence of the visitors who
        join with its code. Another console on another session sees none of it.
      </p>
      <div class="card p-5 flex flex-col gap-3.5 max-w-130">
        <p v-if="error" class="bg-err-1 border border-err-2 text-err-3 rounded px-3.5 py-3 text-14px" role="alert">{{ error }}</p>
        <div class="flex gap-2.5 flex-wrap items-center">
          <button type="button" class="btn-primary" :disabled="busy" @click="start">
            {{ busy ? 'Starting…' : 'Start session' }}
          </button>
          <span class="mono">A code is minted on start.</span>
        </div>
      </div>
    </template>

    <!-- The open session: its code, its link, who is in it. -->
    <template v-else>
      <h1 class="h1">
        Session {{ code }}
        <span class="live"><i class="dot" />open · {{ since }}</span>
      </h1>
      <p class="lead">Visitors open the link or scan the code. Everything they do lands here.</p>
      <div class="card p-5 flex flex-col gap-3.5 max-w-180">
        <p v-if="error" class="bg-err-1 border border-err-2 text-err-3 rounded px-3.5 py-3 text-14px" role="alert">{{ error }}</p>
        <div class="flex gap-6 flex-wrap items-start">
          <div class="flex-[1_1_260px] flex flex-col gap-3">
            <span class="font-mono text-44px font-600 tracking-[0.14em] leading-none">{{ code }}</span>
            <input class="field font-mono text-13px" :value="link" readonly aria-label="Session link" @focus="$event.target.select()">
            <div class="flex gap-2 flex-wrap">
              <button type="button" class="btn-ghost" @click="copy">{{ copied ? 'Copied' : 'Copy link' }}</button>
              <button ref="bigTrigger" type="button" class="btn-ghost" @click="big = true">Show on the big screen</button>
              <button type="button" class="btn-ghost" @click="end">End session</button>
            </div>
          </div>
          <QrCode :value="link" alt="QR code for the session link" :size="140" />
        </div>
        <dl class="flex gap-px bg-line border border-line rounded overflow-hidden m-0">
          <div class="flex-1 bg-paper px-3.5 py-3 min-w-0">
            <dd class="m-0 font-mono text-22px font-600">{{ visitors }}</dd>
            <dt class="text-12px text-ink-2">{{ visitors === 1 ? 'visitor' : 'visitors' }}</dt>
          </div>
          <div class="flex-1 bg-paper px-3.5 py-3 min-w-0">
            <dd class="m-0 font-mono text-22px font-600">{{ orders.length }}</dd>
            <dt class="text-12px text-ink-2">{{ orders.length === 1 ? 'order' : 'orders' }}</dt>
          </div>
        </dl>
      </div>

      <!-- The big screen: the QR and the code, nothing else, until Escape. Close
           is its only control, so Tab stays on it. -->
      <div
        v-if="big"
        class="fixed inset-0 z-50 bg-paper flex flex-col items-center justify-center gap-6 p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Session code on the big screen"
        @click="big = false"
        @keydown.esc="big = false"
        @keydown.tab.prevent
      >
        <QrCode :value="link" alt="QR code for the session link" :size="320" />
        <span class="font-mono text-[clamp(44px,10vw,96px)] font-600 tracking-[0.14em] leading-none">{{ code }}</span>
        <span class="font-mono text-14px text-ink-2 text-center break-all">{{ link }}</span>
        <button type="button" class="btn-ghost" @click.stop="big = false">Close</button>
      </div>
    </template>
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'SessionPage',

  head: () => ({ title: 'Session' }),

  data: () => ({ busy: false, error: '', copied: false, big: false, now: Date.now(), timer: null }),

  computed: {
    ...mapState('session', ['code', 'openedAt', 'visitors', 'orders']),

    link: ({ $config, code }) => (code ? `${$config.storefront}/catalogue?session=${code}` : ''),

    since: ({ openedAt, now }) => {
      const minutes = Math.max(0, Math.round((now - openedAt) / 60000))
      if (minutes < 1) return 'just opened'
      if (minutes < 60) return `${minutes} m`
      return `${Math.floor(minutes / 60)} h ${minutes % 60} m`
    },
  },

  watch: {
    big(on) {
      this.$nextTick(() => {
        if (on) this.$el.querySelector('[role=dialog] button').focus()
        else if (this.$refs.bigTrigger) this.$refs.bigTrigger.focus()
      })
    },
  },

  mounted() {
    this.timer = setInterval(() => (this.now = Date.now()), 30000)
    window.addEventListener('keydown', this.onKey)
  },

  beforeDestroy() {
    clearInterval(this.timer)
    window.removeEventListener('keydown', this.onKey)
  },

  methods: {
    async start() {
      this.busy = true
      this.error = ''
      try {
        await this.$store.dispatch('session/open')
      } catch (error) {
        this.error = error.message
      } finally {
        this.busy = false
      }
    },

    async copy() {
      try {
        await navigator.clipboard.writeText(this.link)
        this.copied = true
        setTimeout(() => (this.copied = false), 2000)
      } catch (e) {
        this.$el.querySelector('input[readonly]').select()
      }
    },

    async end() {
      if (!window.confirm(`End session ${this.code}? Its visitors become strangers to this console.`)) return
      this.error = ''
      try {
        await this.$store.dispatch('session/end')
      } catch (error) {
        this.error = error.message
      }
    },

    onKey(event) {
      if (event.key === 'Escape') this.big = false
    },
  },
}
</script>
