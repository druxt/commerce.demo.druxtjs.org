// Commerce API publishes products as `product--physical`, while Drupal names
// their displays, and Druxt their schemas, `commerce_product--physical`.
// Druxt maps one to the other only through JSON:API Extras, which this site
// does not run, so a product found no display and had no field slots. Asking
// for the Drupal name gives the product page its display's fields.
const ALIASES = [[/^product--/, 'commerce_product--']]

export default ({ $druxtSchema }) => {
  // The plugin object outlives a request on the server, so it is wrapped once.
  if (!$druxtSchema || $druxtSchema.import.aliased) return

  const load = $druxtSchema.import
  $druxtSchema.import = (id) => load(ALIASES.reduce((name, [from, to]) => name.replace(from, to), id))
  $druxtSchema.import.aliased = true
}
