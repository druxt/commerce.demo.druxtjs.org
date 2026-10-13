<template>
  <div v-if="$live" class="flex flex-col gap-4">
    <!-- Where the cart went: someone in the room checked out. -->
    <div v-if="room.closed && !joinOnly" class="card p-4 flex flex-wrap items-center gap-3.5 border-teal/40 bg-teal/5 text-left">
      <p class="flex-[1_1_240px] text-sm leading-relaxed">
        <b class="font-600">{{ room.closed.by === room.you ? 'You' : nameOf(room.closed.by) }} checked out.</b>
        Order #{{ room.closed.number }} is placed and this room is closed.
        {{ room.guest ? 'You can track it with them or start a cart of your own.' : 'The cart above is what was ordered.' }}
      </p>
      <button type="button" class="btn-primary" @click="leave">Start a new cart</button>
    </div>

    <template v-if="bannersOnly">
      <!-- A guest's view of the room. -->
      <div v-if="room.code && room.guest && !room.closed" class="card p-4 flex flex-wrap items-center gap-3.5">
        <p class="flex-[1_1_240px] text-sm leading-relaxed">
          <b class="font-600">You are in {{ ownerName }}'s cart.</b>
          Everything here is shared. Leave to start a cart of your own.
        </p>
        <button type="button" class="btn-secondary" @click="leave">Leave the room</button>
      </div>
      <!-- The owner's view when someone arrives. -->
      <div v-else-if="room.code && !room.guest && !room.closed && others.length" class="card p-4 flex flex-wrap items-center gap-3.5">
        <p class="flex-[1_1_240px] text-sm leading-relaxed">
          <b class="font-600">{{ others[others.length - 1].name }} joined from a second phone.</b>
          They see this cart as it is. Items either of you add appear for both.
        </p>
        <NuxtLink to="/catalogue" class="btn-secondary">Browse the catalogue</NuxtLink>
      </div>
      <!-- Someone else just changed the cart. -->
      <p v-if="nudge" class="self-start inline-flex items-center gap-2.5 bg-ink text-paper text-13px px-3.5 py-2.5 rounded" aria-live="polite">
        <span class="w-1.5 h-1.5 rounded-full bg-mint" aria-hidden="true" />
        {{ nudge }}
        <span class="font-mono text-11px text-ink-3">just now</span>
      </p>
    </template>

    <template v-else-if="!joinOnly">
      <!-- Not in a room: the offer. -->
      <div v-if="!room.code" class="card p-4 md:p-5 flex flex-wrap items-center gap-3.5">
        <p class="flex-[1_1_240px] text-sm text-ink-2 leading-relaxed">
          Shopping with someone? Open a room and they add to this cart from their own phone.
        </p>
        <p v-if="error" class="w-full text-sm text-warn" role="alert">{{ error }}</p>
        <button type="button" class="btn-secondary" :disabled="busy" @click="open">{{ busy ? 'Opening…' : 'Shop together' }}</button>
      </div>

      <!-- The owner's room: link, code, QR, who is here. -->
      <div v-else-if="!room.guest && !room.closed" class="card p-5 grid gap-5 grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] items-start">
        <div>
          <h2 class="text-17px font-700 mb-1.5">Shop together</h2>
          <p class="text-sm text-ink-2 leading-relaxed mb-3.5">
            Anyone with this link or code adds to this cart from their own phone. One cart, one order, two people.
          </p>
          <div class="flex flex-wrap gap-2">
            <input class="field flex-[1_1_180px] font-mono text-13px" :value="link" readonly aria-label="Room link" @focus="$event.target.select()">
            <button type="button" class="btn-secondary" @click="copy">{{ copied ? 'Copied' : 'Copy link' }}</button>
          </div>
          <p class="font-mono text-12px text-ink-2 flex items-center gap-2 mt-3">
            <span class="w-1.5 h-1.5 rounded-full bg-teal shrink-0" aria-hidden="true" />
            {{ presence }}
          </p>
        </div>
        <div class="flex flex-col items-start gap-2">
          <QrCode :value="link" alt="QR code for the room link" :size="132" />
          <span class="font-mono text-11px text-ink-2">Code <b class="text-ink font-500">{{ room.code }}</b> · room open</span>
        </div>
      </div>
    </template>

    <!-- The empty cart: a code from someone shopping with you. -->
    <form v-if="joinOnly && !room.code" class="flex flex-col gap-2 text-left" @submit.prevent="join">
      <p class="text-13px text-ink-2">Have a code from someone shopping with you?</p>
      <div class="flex gap-2">
        <input
          v-model="code"
          class="field flex-1 min-w-0 font-mono uppercase"
          placeholder="K7P4QX"
          maxlength="6"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          aria-label="Room code"
        >
        <button type="submit" class="btn-secondary shrink-0 whitespace-nowrap" :disabled="busy || code.length !== 6">Join their cart</button>
      </div>
      <p v-if="error" class="text-sm text-warn" role="alert">{{ error }}</p>
    </form>
  </div>
</template>

<script>
export default {
  name: 'ShopTogether',

  props: {
    // The empty cart's join field alone.
    joinOnly: { type: Boolean, default: false },
    // The banners and the nudge above the lines, not the room card.
    bannersOnly: { type: Boolean, default: false },
  },

  data: () => ({ busy: false, error: '', copied: false, code: '', now: Date.now(), timer: null }),

  computed: {
    room: ({ $live }) => $live.room,

    link: ({ room }) => (room.code ? `${window.location.origin}/cart?join=${room.code}` : ''),

    others: ({ room }) => room.members.filter((m) => m.id !== room.you),

    ownerName: ({ room }) => room.names[room.owner] || 'someone',

    presence: ({ others }) =>
      others.length
        ? `You and ${others.map((m) => m.name).join(' and ')}`
        : 'Only you so far · waiting for a second phone',

    nudge: ({ room, now }) => {
      const change = room.lastChange
      if (!change || now - change.at > 10000) return ''
      const what = change.what || {}
      return `${change.byName} ${what.verb || 'changed'} ${what.title || 'the cart'}`
    },
  },

  watch: {
    'room.error'(message) {
      if (message) this.error = message
    },
  },

  mounted() {
    this.timer = setInterval(() => (this.now = Date.now()), 2000)
    if (this.room.error) this.error = this.room.error
  },

  beforeDestroy() {
    clearInterval(this.timer)
  },

  methods: {
    nameOf(id) {
      return this.room.names[id] || 'Someone'
    },

    async open() {
      this.busy = true
      this.error = ''
      try {
        await this.$live.openRoom()
      } catch (error) {
        this.error = error.message
      } finally {
        this.busy = false
      }
    },

    async join() {
      this.busy = true
      this.error = ''
      try {
        await this.$live.joinRoom(this.code)
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

    // The room's cart goes with the room, so the page is back to its top, where
    // the empty cart says what to do next.
    leave() {
      this.$live.leaveRoom()
      this.$nextTick(() => window.scrollTo({ top: 0 }))
    },
  },
}
</script>
