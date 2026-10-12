<template>
  <div>
    <template v-if="!code">
      <h1 class="h1">Assist</h1>
      <div class="card p-5 max-w-130">
        <p class="text-14px text-ink-2 leading-relaxed">
          Threads belong to a session. <NuxtLink to="/">Start a session</NuxtLink> first.
        </p>
      </div>
    </template>

    <template v-else>
      <h1 class="h1">
        Assist
        <span class="live" :class="waiting.length && 'text-err-3'"><i class="dot" :class="waiting.length && 'bg-err-3'" />{{ waiting.length ? `${waiting.length} waiting` : 'nobody waiting' }}</span>
      </h1>
      <p class="lead">
        Visitors who asked for a person. Each thread arrives with its concierge transcript, so you answer the question they already asked.
      </p>
      <p v-if="error" class="bg-err-1 border border-err-2 text-err-3 rounded px-3.5 py-3 text-14px mb-3.5" role="alert">{{ error }}</p>

      <div class="grid gap-4 items-start grid-cols-1 md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <!-- The list: waiting first, then yours, then the concierge's. -->
        <div class="card">
          <template v-for="group in groups">
            <div :key="group.label" class="px-4 py-2.5 text-11px font-600 uppercase tracking-wider text-ink-2 bg-paper-2 border-b border-line">{{ group.label }}</div>
            <p v-if="!group.threads.length" :key="group.label + '-empty'" class="px-4 py-3 text-13px text-ink-2 border-b border-line">None right now.</p>
            <button
              v-for="t in group.threads"
              :key="t.code"
              type="button"
              class="w-full text-left px-4 py-3.5 border-b border-line flex flex-col gap-1.25 bg-transparent"
              :class="t.code === selected && 'bg-paper-2'"
              @click="select(t.code)"
            >
              <span class="text-14px font-600 leading-snug">{{ t.question || 'No question yet' }}</span>
              <span class="text-12px text-ink-2 flex gap-2 flex-wrap">
                <span>{{ t.visitorName || 'anonymous' }}</span>
                <span v-if="t.state === 'waiting'" class="text-err-3 font-600">waiting {{ since(t.waitingSince) }}</span>
                <span v-else-if="t.state === 'with_operator'">with {{ t.operatorName }}</span>
                <span>{{ t.turns.length }} {{ t.turns.length === 1 ? 'message' : 'messages' }}</span>
              </span>
            </button>
          </template>
        </div>

        <!-- The thread. -->
        <div v-if="current" class="card">
          <div class="px-4 py-3.5 border-b border-line flex items-center gap-3 flex-wrap">
            <b class="text-14px">{{ current.visitorName || 'anonymous' }}</b>
            <span class="mono">{{ current.route ? `on ${current.route}` : '' }}{{ current.cartCount ? ` · cart ${current.cartCount} ${current.cartCount === 1 ? 'item' : 'items'}` : '' }} · session {{ code }}</span>
            <button v-if="current.state !== 'with_operator'" type="button" class="btn-primary btn-sm ml-auto" :disabled="busy" @click="claim">Claim this thread</button>
            <span v-else class="pill border-teal-3 bg-teal-2 text-teal-4 ml-auto">{{ current.operatorName === me ? 'yours' : `with ${current.operatorName}` }}</span>
          </div>
          <div ref="transcript" class="p-4 flex flex-col gap-3 bg-paper-2 max-h-[50vh] overflow-auto">
            <div
              v-for="(t, i) in current.turns"
              :key="i"
              class="max-w-[88%] px-3 py-2.5 rounded text-14px leading-relaxed border"
              :class="t.author === 'visitor' ? 'ml-auto bg-neutral text-paper border-neutral' : t.author === 'operator' ? 'ml-auto bg-accent text-paper border-accent' : 'bg-paper border-line'"
            >
              <p class="text-10px font-600 tracking-widest uppercase mb-1" :class="t.author === 'concierge' ? 'text-ink-2' : 'text-line'">
                {{ t.author === 'operator' ? `${t.by || 'operator'}` : t.author }}{{ t.picks && t.picks.length ? ` · ${t.picks.length} picks` : '' }}
              </p>
              {{ t.body }}
              <p v-if="t.picks && t.picks.length" class="mono mt-1" :class="t.author !== 'concierge' && 'text-line'">{{ t.picks.map((p) => p.sku).join(' · ') }}</p>
            </div>
            <p v-if="!current.turns.length" class="text-13px text-ink-2">Nothing said yet.</p>
          </div>

          <!-- The composer, once the thread is yours. -->
          <form v-if="current.state === 'with_operator' && current.operatorName === me" class="px-4 py-3 border-t border-line flex flex-col gap-2.5" @submit.prevent="send">
            <div v-if="picks" class="border border-line rounded bg-paper-2 p-3 flex flex-col gap-1.5">
              <p class="mono text-ink font-600">Concierge picks for “{{ picks.question }}”</p>
              <label v-for="p in picks.picks" :key="p.sku" class="flex items-center gap-2.5 min-h-11 text-14px">
                <input v-model="p.on" type="checkbox">
                <span>{{ p.sku }}</span>
                <span class="mono ml-auto text-ink">{{ p.why }}</span>
              </label>
              <p v-if="!picks.picks.length" class="text-13px text-ink-2">Nothing came back.</p>
              <div class="flex gap-2 flex-wrap">
                <button type="button" class="btn-primary btn-sm" :disabled="!picks.picks.some((p) => p.on)" @click="forward">Forward {{ picks.picks.filter((p) => p.on).length }} picks</button>
                <button type="button" class="btn-ghost btn-sm" @click="$store.commit('assist/picks', null)">Cancel</button>
              </div>
            </div>
            <textarea v-model="draft" class="field min-h-18 py-2.5 resize-none" :placeholder="picks ? 'Add a line to go with the picks' : `Reply as ${me}`" aria-label="Your reply" />
            <div class="flex gap-2 flex-wrap">
              <button type="submit" class="btn-primary" :disabled="!draft.trim()">Send</button>
              <button type="button" class="btn-ghost" :disabled="asking || !draft.trim()" @click="ask">{{ asking ? 'Asking…' : 'Ask the concierge for picks' }}</button>
              <button type="button" class="btn-ghost ml-auto" @click="handback">Hand back</button>
            </div>
          </form>
        </div>
        <div v-else class="card p-6 text-14px text-ink-2">Pick a thread to read it.</div>
      </div>
    </template>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  name: 'AssistPage',

  head: () => ({ title: 'Assist' }),

  data: () => ({ draft: '', busy: false, now: Date.now(), timer: null }),

  computed: {
    ...mapState('assist', ['selected', 'error', 'picks', 'asking']),
    ...mapGetters('assist', ['waiting', 'claimed', 'others', 'current']),

    code: ({ $store }) => $store.state.session.code,

    me: ({ $auth }) => ($auth.user && ($auth.user.preferred_username || $auth.user.name)) || 'operator',

    groups: ({ waiting, claimed, others }) => [
      { label: 'Waiting', threads: waiting },
      { label: 'With an operator', threads: claimed },
      { label: 'With the concierge', threads: others },
    ],
  },

  watch: {
    'current.turns.length'() {
      this.$nextTick(() => {
        const el = this.$refs.transcript
        if (el) el.scrollTop = el.scrollHeight
      })
    },
  },

  mounted() {
    this.timer = setInterval(() => (this.now = Date.now()), 1000)
  },

  beforeDestroy() {
    clearInterval(this.timer)
  },

  methods: {
    since(at) {
      if (!at) return ''
      const s = Math.max(0, Math.round((this.now - at) / 1000))
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    },
    select(code) {
      this.$store.commit('assist/select', code)
    },
    async claim() {
      this.busy = true
      await this.$store.dispatch('assist/claim', this.selected)
      this.busy = false
    },
    send() {
      const text = this.draft.trim()
      if (!text) return
      this.$store.dispatch('assist/say', { code: this.selected, text })
      this.draft = ''
    },
    ask() {
      this.$store.dispatch('assist/askConcierge', this.draft.trim())
    },
    forward() {
      const picks = this.picks.picks.filter((p) => p.on).map(({ sku, why }) => ({ sku, why }))
      this.$store.dispatch('assist/say', { code: this.selected, text: this.draft.trim() || this.picks.note || 'A few picks for you.', picks })
      this.$store.commit('assist/picks', null)
      this.draft = ''
    },
    handback() {
      this.$store.dispatch('assist/handback', this.selected)
    },
  },
}
</script>
