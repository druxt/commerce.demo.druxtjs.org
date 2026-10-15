<template>
  <div class="min-h-screen flex flex-col bg-paper-2">
    <!-- The bar: what this is, the session it holds, who is signed in. -->
    <header class="h-13 bg-neutral text-paper flex items-center gap-3.5 px-[clamp(14px,2vw,20px)] shrink-0 min-w-0">
      <span class="font-700 text-14px flex items-center gap-2 whitespace-nowrap shrink-0">
        <DruxtMark class="w-4.5 h-3.5" />
        Operator console
      </span>
      <span
        v-if="code"
        class="font-mono text-12px bg-white/15 rounded-full px-2.5 py-1 whitespace-nowrap min-w-0 overflow-hidden text-ellipsis"
      >{{ code }}</span>
      <span v-if="signedIn" class="ml-auto text-13px text-line whitespace-nowrap shrink-0 hidden md:inline">
        {{ user }} · operator
      </span>
    </header>

    <!-- Below md the sections are tabs; at md and up a side nav. -->
    <nav v-if="signedIn" class="md:hidden flex gap-1 overflow-x-auto px-3 pt-2 border-b border-line bg-paper-2" aria-label="Sections">
      <NuxtLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="shrink-0 h-11 flex items-center px-3 text-14px font-500 text-ink-2 border-b-2 border-transparent whitespace-nowrap"
        exact-active-class="text-accent border-accent"
      >{{ item.label }}</NuxtLink>
      <button type="button" class="shrink-0 h-11 px-3 text-14px font-500 text-ink-2 ml-auto bg-transparent border-0" @click="signOut">
        Sign out
      </button>
    </nav>

    <div class="flex items-stretch flex-1">
      <nav v-if="signedIn" class="hidden md:flex w-55 shrink-0 p-3 pt-4 flex-col gap-0.5 border-r border-line" aria-label="Sections">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center h-11 px-3 rounded text-ink-2 text-14px font-500"
          exact-active-class="bg-paper text-accent shadow-[0_1px_0_#dbe3ec]"
        >{{ item.label }}</NuxtLink>
        <button type="button" class="mt-auto flex items-center h-11 px-3 rounded text-ink-2 text-14px font-500 bg-transparent border-0 text-left" @click="signOut">
          Sign out
        </button>
      </nav>

      <main class="flex-1 min-w-0 p-[clamp(16px,3vw,28px)]">
        <Nuxt />
      </main>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DefaultLayout',

  computed: {
    signedIn: ({ $auth, $store }) => !!$auth.loggedIn && $store.state.operator.allowed,
    user: ({ $auth }) => ($auth.user && ($auth.user.preferred_username || $auth.user.name)) || '',
    code: ({ $store }) => $store.state.session.code,
    nav: ({ waiting }) => [
      { to: '/', label: 'Session' },
      { to: '/orders', label: 'Orders' },
      { to: '/assist', label: waiting ? `Assist · ${waiting}` : 'Assist' },
    ],

    waiting: ({ $store }) => $store.getters['assist/waiting'].length,
  },

  methods: {
    async signOut() {
      await this.$store.dispatch('session/detach')
      await this.$auth.logout()
    },
  },
}
</script>
