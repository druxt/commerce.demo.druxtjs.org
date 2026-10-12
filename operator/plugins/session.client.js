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
}
