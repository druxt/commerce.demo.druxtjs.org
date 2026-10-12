// Signed in is not enough: the account must act with the operator role.
// Simple OAuth's token debug route answers only to a token whose permissions
// include `debug simple_oauth tokens`, which the operator role holds and a
// shopper's does not, and it names the roles. Checked once per token.
export default async function ({ $auth, $axios, store, redirect, route }) {
  if (!$auth.loggedIn) return
  if (route.path === '/not-an-operator') return
  const token = String(($auth.strategy.token && $auth.strategy.token.get()) || '')
  if (store.state.operator.token !== token) {
    let allowed = false
    try {
      const res = await $axios.get('/oauth/debug', {
        headers: { Accept: 'application/json' },
        validateStatus: () => true,
      })
      allowed =
        res.status === 200 && Array.isArray(res.data.roles) && res.data.roles.includes('operator')
    } catch {
      allowed = false
    }
    store.commit('operator/set', { token, allowed })
  }
  if (!store.state.operator.allowed) return redirect('/not-an-operator')
}
