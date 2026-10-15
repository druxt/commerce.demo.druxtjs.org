// Commerce's default order workflow with fulfillment (`order_fulfillment`,
// set on the order type by live-setup.php): draft, fulfillment, completed,
// canceled. A placed order arrives in fulfillment. The buttons offer what
// the workflow allows from the state the board last saw; Drupal has the
// final say and its answer is shown.
const WORKFLOW = {
  draft: [],
  fulfillment: [
    { id: 'fulfill', label: 'Complete', to: 'completed' },
    { id: 'cancel', label: 'Cancel', to: 'canceled' },
  ],
  completed: [],
  canceled: [],
}

const LABELS = {
  draft: 'Draft',
  fulfillment: 'Being fulfilled',
  completed: 'Completed',
  canceled: 'Canceled',
}

const transitionsFor = (state) => WORKFLOW[state] || []

/** What the shipment allows: ready ships; shipped is done. */
const shipmentTransitionsFor = (state) =>
  state === 'ready' ? [{ id: 'ship', label: 'Ship it', to: 'shipped' }] : []

const shipmentLabel = (state) =>
  ({ draft: 'Not ready', ready: 'Ready to ship', shipped: 'Shipped', canceled: 'Canceled' })[
    state
  ] ||
  state ||
  ''
const label = (state) => LABELS[state] || state

module.exports = { transitionsFor, label, shipmentTransitionsFor, shipmentLabel }
