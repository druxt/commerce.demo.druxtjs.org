<template>
  <!-- Drupal's processed HTML, styled by the prose rules. -->
  <div class="prose" v-html="html" />
</template>

<script>
import { DruxtFieldMixin } from 'druxt-entity'

// Drupal's formatted text, as a blog post's or a product's body.
export default {
  name: 'DruxtFieldTextDefault',
  mixins: [DruxtFieldMixin],
  computed: {
    html: ({ items }) => items.map((item) => (item || {}).processed || '').join(''),
  },
}
</script>
