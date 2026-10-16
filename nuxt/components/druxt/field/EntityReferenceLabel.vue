<template>
  <!-- Drupal's label goes to assistive technology only, and the terms are
       not links: the storefront has no term pages. -->
  <ul v-if="labels.length" class="flex flex-wrap gap-2 p-0 m-0 list-none" :aria-label="schema.label.text">
    <li v-for="label in labels" :key="label" class="font-mono text-11px tracking-wide uppercase border border-solid border-line-2 rounded-full px-3 py-1 text-ink-2">{{ label }}</li>
  </ul>
</template>

<script>
import { DruxtFieldMixin } from 'druxt-entity'

// Referenced entities by name, as a row of tags. The entity template's own
// fetch has usually put them in the store already.
export default {
  name: 'DruxtFieldEntityReferenceLabel',

  mixins: [DruxtFieldMixin],

  data: () => ({ labels: [] }),

  async fetch() {
    const resources = await Promise.all(
      this.items.map(({ type, uuid }) => this.$store.dispatch('druxt/getResource', { type, id: uuid }))
    )
    this.labels = resources
      .map((resource) => ((resource || {}).data || {}).attributes || {})
      .map((attrs) => attrs.name || attrs.title)
      .filter(Boolean)
  },

  // A field slot keeps its component when another entity takes the template.
  watch: {
    value: '$fetch',
  },
}
</script>
