// Keeps the signed-in console attached to its session, and forgets the role
// check when the account changes.
export default ({ store }) => {
  if (store.state.auth && store.state.auth.loggedIn) store.dispatch('session/attach')
  store.watch(
    (s) => (s.auth || {}).loggedIn,
    (loggedIn) => {
      store.commit('operator/reset')
      if (loggedIn) store.dispatch('session/attach')
    }
  )
  // The session's assist threads follow the session.
  store.watch(
    (s) => s.session.code,
    (code) => (code ? store.dispatch('assist/follow', code) : store.dispatch('assist/unfollow'))
  )
  if (store.state.session.code) store.dispatch('assist/follow', store.state.session.code)
}
