<template>
  <div class="mx-auto max-w-5xl px-5 py-12 flex flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-3xl">Checkout</h1>
      <ol class="flex flex-wrap gap-x-6 gap-y-1 label-mono list-none p-0 m-0" aria-label="Checkout progress">
        <li v-for="(s, i) in steps" :key="s" :class="i === step ? 'text-ink' : i < step ? 'text-teal' : ''">
          {{ i + 1 }}. {{ s }}<span v-if="i < step" aria-label=" (done)"> &check;</span>
        </li>
      </ol>
    </header>

    <!--
      Said before anything is entered rather than after: the order is real,
      the money is not. Email and address are PATCHed to the Drupal Commerce
      order over commerce_api, the payment goes through Commerce's example
      gateway with its test card, and the order is placed. No card details
      are asked for.
    -->
    <aside class="card p-4 flex gap-3 items-start bg-paper-3">
      <div class="text-sm text-ink-2">
        <p class="font-600 text-ink">A demo checkout. The order is real, the money is not.</p>
        <p>
          Your email and address are saved to a Drupal Commerce order over JSON:API, the
          payment goes through Commerce's example gateway with its test card, and the order
          is placed and numbered. No card details are collected. The daily reset clears it.
        </p>
      </div>
    </aside>

    <p v-if="error" class="card p-4 text-sm text-warn border-warn" role="alert">{{ error }}</p>

    <div v-if="isEmpty && !done" class="card p-10 flex flex-col items-center gap-4 text-center">
      <p class="text-lg text-ink-2">There is nothing to check out.</p>
      <NuxtLink to="/catalogue" class="btn-primary">Browse the catalogue</NuxtLink>
    </div>

    <div v-else class="grid gap-8 md:grid-cols-[1fr_20rem] items-start">
      <section class="flex flex-col gap-6">
        <!-- 1. Contact -->
        <form v-if="step === 0" class="card p-6 flex flex-col gap-4" @submit.prevent="saveEmail">
          <h2 class="text-xl">Contact</h2>
          <label class="flex flex-col gap-1.5">
            <span class="label-mono">Email address</span>
            <input v-model="email" type="email" required autocomplete="email" class="field" placeholder="you@example.com">
          </label>
          <button type="submit" class="btn-primary self-start" :disabled="busy">Continue to address</button>
        </form>

        <!-- 2. Address -->
        <form v-else-if="step === 1" class="card p-6 flex flex-col gap-4" @submit.prevent="saveAddress">
          <h2 class="text-xl">Delivery address</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="label-mono">First name</span>
              <input v-model="address.given_name" required autocomplete="given-name" class="field">
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="label-mono">Last name</span>
              <input v-model="address.family_name" required autocomplete="family-name" class="field">
            </label>
          </div>
          <label class="flex flex-col gap-1.5">
            <span class="label-mono">Street address</span>
            <input v-model="address.address_line1" required autocomplete="address-line1" class="field">
          </label>
          <div class="grid gap-4 sm:grid-cols-3">
            <label class="flex flex-col gap-1.5">
              <span class="label-mono">Suburb</span>
              <input v-model="address.locality" required autocomplete="address-level2" class="field">
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="label-mono">State</span>
              <input v-model="address.administrative_area" required autocomplete="address-level1" class="field">
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="label-mono">Postcode</span>
              <input v-model="address.postal_code" required autocomplete="postal-code" inputmode="numeric" class="field">
            </label>
          </div>
          <div class="flex gap-3">
            <button type="button" class="btn-secondary" @click="step = 0">Back</button>
            <button type="submit" class="btn-primary" :disabled="busy">Continue to payment</button>
          </div>
        </form>

        <!-- 3. Payment, through the example gateway -->
        <form v-else-if="step === 2" class="card p-6 flex flex-col gap-4" @submit.prevent="pay">
          <h2 class="text-xl">Payment</h2>
          <p class="text-sm text-ink-2">
            A real storefront would mount a gateway's hosted card field here, so card data
            never touches this application. This demo sends Commerce's example gateway its
            test card. Choose what the gateway should answer.
          </p>

          <fieldset class="flex flex-col gap-2">
            <legend class="label-mono mb-1">Gateway outcome</legend>
            <label v-for="o in outcomes" :key="o.value" class="flex items-start gap-3 p-3 border border-line rounded cursor-pointer hover:border-line-2">
              <input v-model="outcome" type="radio" :value="o.value" class="mt-1">
              <span>
                <span class="font-600 text-sm">{{ o.label }}</span>
                <span class="block text-sm text-ink-2">{{ o.detail }}</span>
              </span>
            </label>
          </fieldset>

          <div class="flex gap-3">
            <button type="button" class="btn-secondary" @click="step = 1">Back</button>
            <button type="submit" class="btn-primary" :disabled="busy">
              {{ busy ? 'Processing…' : `Pay ${total}` }}
            </button>
          </div>
        </form>

        <!-- 4. Outcome -->
        <div v-else class="card p-8 flex flex-col gap-4">
          <template v-if="declined">
            <h2 class="text-xl text-warn">Payment declined</h2>
            <p class="text-sm text-ink-2">
              The example gateway refused the payment, the way it does for its test
              postcode. Commerce left the order in its draft state with the cart intact, so
              nothing is lost. Drupal said: {{ error }}
            </p>
            <div class="flex gap-3">
              <button type="button" class="btn-primary" @click="step = 2">Try again</button>
              <NuxtLink to="/cart" class="btn-secondary">Back to cart</NuxtLink>
            </div>
          </template>
          <template v-else>
            <h2 class="text-xl text-teal">Order<template v-if="placed.order_number"> #{{ placed.order_number }}</template> placed</h2>
            <p class="text-sm text-ink-2">
              Drupal Commerce recorded the payment, placed the order and moved it into its
              fulfilment workflow. A confirmation would go to
              <span class="text-ink">{{ placed.email || email }}</span>.
            </p>
            <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt class="label-mono self-center">Order</dt>
              <dd class="tabular-nums">{{ placed.order_number ? '#' + placed.order_number : 'unknown' }}</dd>
              <dt class="label-mono self-center">State</dt>
              <dd class="font-mono">{{ placed.state || 'unknown' }}</dd>
              <dt class="label-mono self-center">Total</dt>
              <dd class="tabular-nums font-600">{{ paidTotal }}</dd>
            </dl>
            <div class="flex flex-wrap gap-3 pt-2">
              <NuxtLink :to="`/order/${placed.id}`" class="btn-primary">Follow the order</NuxtLink>
              <NuxtLink to="/catalogue" class="btn-secondary">Continue shopping</NuxtLink>
            </div>
            <client-only>
              <DruxtDemoNote
                match="/jsonapi/checkout/"
                file="nuxt/pages/checkout.vue"
                body="Three writes to commerce_api's checkout resource: the contact and address, the payment instrument for the example gateway, then the payment, which placed the order. This is Drupal's order, as it answered."
              />
              <DruxtDemoDrawer :path="`/jsonapi/checkout/${placed.id}`" />
            </client-only>
          </template>
        </div>
      </section>

      <!-- Order summary -->
      <aside v-if="!isEmpty" class="card p-5 flex flex-col gap-3">
        <h2 class="label-mono">Order summary</h2>
        <ul class="flex flex-col gap-2">
          <li v-for="line in lines" :key="line.id" class="flex justify-between gap-3 text-sm">
            <span class="text-ink-2">{{ line.quantity }} &times; {{ line.title }}</span>
            <span class="tabular-nums">{{ line.total }}</span>
          </li>
        </ul>
        <div class="flex justify-between font-600 pt-3 border-t border-line">
          <span>Total</span><span class="tabular-nums">{{ total }}</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  name: 'CheckoutPage',

  fetchOnServer: false,
  fetch() {
    return this.$store.dispatch('cart/load')
  },

  head: () => ({ title: 'Checkout' }),

  data: () => ({
    step: 0,
    steps: ['Contact', 'Address', 'Payment'],
    email: '',
    address: {
      given_name: '', family_name: '', address_line1: '',
      locality: '', administrative_area: '', postal_code: '', country_code: 'AU',
    },
    outcome: 'approved',
    outcomes: [
      { value: 'approved', label: 'Approved', detail: 'The gateway takes the test card and Commerce places the order.' },
      { value: 'declined', label: 'Declined', detail: 'The gateway refuses it. The order stays a draft and the cart survives.' },
    ],
    busy: false,
    error: undefined,
    done: false,
    declined: false,
    placed: null,
    paidTotal: '',
  }),

  computed: {
    ...mapState('cart', ['lines']),
    ...mapGetters('cart', ['total', 'isEmpty', 'orderId']),
  },

  watch: {
    // The cart empties when the order is placed; the id is kept for the read.
    orderId(id) {
      if (id) this.orderIdPlaced = id
    },
  },

  created() {
    this.orderIdPlaced = this.orderId
  },

  methods: {
    // Every step is a real write to the Drupal order.
    async patch(attributes) {
      this.busy = true
      this.error = undefined
      try {
        await this.$store.dispatch('cart/checkout', attributes)
        return true
      } catch (error) {
        this.error = error.message
        return false
      } finally {
        this.busy = false
      }
    },

    async saveEmail() {
      if (await this.patch({ email: this.email })) this.step = 1
    },

    async saveAddress() {
      if (await this.patch({ billing_information: { address: { ...this.address } } })) this.step = 2
    },

    // The payment instrument is the example gateway's test card. The
    // gateway declines a billing postcode of 53140, which is how "Declined"
    // is asked for; the order then stays a draft and the cart survives.
    async pay() {
      this.paidTotal = this.total
      this.declined = false
      const address = { ...this.address }
      if (this.outcome === 'declined') address.postal_code = '53140'
      const instrument = {
        payment_gateway_id: 'example_credit_card',
        payment_method_type: 'credit_card',
        payment_details: {
          type: 'visa',
          number: '4111111111111111',
          expiration: { month: '12', year: '2030' },
          security_code: '123',
        },
      }
      if (!(await this.patch({ billing_information: { address }, payment_instrument: instrument }))) {
        this.declined = true
        this.step = 3
        return
      }
      this.busy = true
      try {
        await this.$store.dispatch('cart/pay')
      } catch (error) {
        this.error = error.message
        this.declined = true
        this.busy = false
        this.step = 3
        return
      }
      // Paid and placed, so the cart is empty. A failed read of the order
      // leaves its details out and keeps the confirmation.
      this.placed = { id: this.orderIdPlaced }
      this.done = true
      // A demo session's console hears the order, proven by the cart token.
      if (this.$live) this.$live.placed(this.placed.id)
      try {
        const body = await this.$store.dispatch('cart/order', this.orderIdPlaced)
        this.placed = { id: body.data.id, ...body.data.attributes }
      } catch (error) {
        this.error = `The order is placed, but Drupal did not return it: ${error.message}`
      } finally {
        this.busy = false
        this.step = 3
      }
    },
  },
}
</script>
