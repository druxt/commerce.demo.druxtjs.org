<template>
  <div class="max-w-110 mx-auto my-[clamp(16px,6vw,56px)] flex flex-col gap-3.5">
    <div class="card p-5 flex flex-col gap-3.5">
      <h1 class="text-24px font-700">Not an operator</h1>
      <p class="bg-err-1 border border-err-2 text-err-3 rounded px-3.5 py-3 text-14px leading-relaxed" role="alert">
        Signed in as <b>{{ user }}</b>, but that account has no operator role. Nothing from any
        session was loaded.
      </p>
      <p class="text-14px text-ink-2 leading-relaxed">
        Ask for the role, then sign in again. The storefront account you use as a shopper is a
        different thing from this one.
      </p>
      <button type="button" class="btn-ghost self-start" @click="$auth.logout()">Sign out</button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'NotAnOperatorPage',

  head: () => ({ title: 'Not an operator' }),

  computed: {
    user: ({ $auth }) => ($auth.user && ($auth.user.preferred_username || $auth.user.name)) || 'this account',
  },
}
</script>
