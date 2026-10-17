<template>
  <!-- Bare text, so the field takes the look of the element it is placed in. -->
  <span>{{ items.join(' ') }}</span>
</template>

<script>
import { DruxtFieldMixin } from 'druxt-entity'

// Drupal's plain text formatter, for a product's title among others.
export default {
  name: 'DruxtFieldString',
  mixins: [DruxtFieldMixin],
}
</script>
