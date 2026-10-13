// Signed in is not enough: the account must act with the operator role.
// Simple OAuth's token debug route answers only to a token whose permissions
// include `debug simple_oauth tokens`, which the operator role holds and a
// shopper's does not, and it names the roles. Checked once per token, unless
// Drupal fails to answer, in which case the next navigation asks again.
export default async function ({ $auth, $axios, store, redirect, route }) {
  if (!$auth.loggedIn) return
  if (route.path === '/not-an-operator') return
  const token = String(($auth.strategy.token && $auth.strategy.token.get()) || '')
  if (store.state.operator.token !== token) {
    let allowed
    try {
      const res = await $axios.get('/oauth/debug', {
        headers: { Accept: 'application/json' },
        validateStatus: () => true,
      })
      if (res.status === 200) {
        allowed = Array.isArray(res.data.roles) && res.data.roles.includes('operator')
      } else if (res.status === 401 || res.status === 403) {
        allowed = false
      }
    } catch {}
    if (allowed === undefined) return redirect('/not-an-operator')
    store.commit('operator/set', { token, allowed })
  }
  if (!store.state.operator.allowed) return redirect('/not-an-operator')
}
