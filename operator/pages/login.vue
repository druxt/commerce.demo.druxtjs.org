<template>
  <div class="max-w-110 mx-auto my-[clamp(16px,6vw,56px)] flex flex-col gap-3.5">
    <form class="card p-5 flex flex-col gap-3.5" @submit.prevent="signIn">
      <h1 class="text-24px font-700">Sign in</h1>
      <p class="text-14px text-ink-2 leading-relaxed">
        Use the Drupal account that carries the operator role. Nothing on this console is visible
        to visitors, and a console sees only the session it opens.
      </p>
      <p v-if="error" class="bg-err-1 border border-err-2 text-err-3 rounded px-3.5 py-3 text-14px" role="alert">{{ error }}</p>
      <label class="lbl">
        Username
        <input v-model="username" class="field" type="text" name="username" autocomplete="username" autocapitalize="off" required>
      </label>
      <label class="lbl">
        Password
        <input v-model="password" class="field" type="password" name="password" autocomplete="current-password" required>
      </label>
      <button type="submit" class="btn-primary" :disabled="busy || !username || !password">
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>
      <span class="mono">Simple OAuth · password grant · consumer: commerce_operator</span>
    </form>
  </div>
</template>

<script>
export default {
  name: 'LoginPage',

  auth: 'guest',

  head: () => ({ title: 'Sign in' }),

  data: () => ({ username: '', password: '', busy: false, error: '' }),

  methods: {
    // The grant is made by the server route with the consumer's id; the
    // browser sends what was typed and the scope the console works in. A
    // token's roles are the scope's roles the account holds, so a shopper
    // asking for the same scope gets a token that can do nothing here.
    async signIn() {
      this.busy = true
      this.error = ''
      try {
        await this.$auth.loginWith('drupal-password', {
          data: { username: this.username.trim(), password: this.password, scope: 'operator' },
        })
        // The operator middleware decides where this lands; a redirect on
        // the way is its answer, not an error.
        await this.$router.replace('/').catch(() => {})
      } catch (error) {
        const body = (error.response || {}).data || {}
        this.error = body.error_description || body.message || 'Sign-in failed. Check the username and password.'
      } finally {
        this.busy = false
      }
    },
  },
}
</script>
