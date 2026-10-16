<template>
  <div>
    <img v-for="image in images" :key="image.src" :src="image.src" :alt="image.alt" loading="lazy" class="block w-full">
  </div>
</template>

<script>
import { DruxtFieldMixin } from 'druxt-entity'

// Drupal's image formatter. The field holds file references, and the files
// hold the URLs. A field with its own look extends this for them.
export default {
  name: 'DruxtFieldImage',

  mixins: [DruxtFieldMixin],

  data: () => ({ images: [] }),

  async fetch() {
    const data = (this.value || {}).data
    const refs = (Array.isArray(data) ? data : [data]).filter((ref) => ref && ref.id)
    const files = await Promise.all(refs.map(({ type, id }) => this.$store.dispatch('druxt/getResource', { type, id })))
    this.images = refs
      .map((ref, i) => ({
        src: ((((files[i] || {}).data || {}).attributes || {}).uri || {}).url,
        // Drupal keeps the alt text on the reference, not on the file.
        alt: (ref.meta || {}).alt || '',
      }))
      .filter((image) => image.src)
  },

  // A field slot keeps its component when another entity takes the template.
  watch: {
    value: '$fetch',
  },
}
</script>
