<template>
  <!-- Drupal ships rendered HTML here, so it is styled by the prose rules
       rather than by utilities that cannot reach inside it. -->
  <div v-if="text" class="prose text-ink-2" v-html="text" />
</template>

<script>
import inlineBlock from '~/mixins/inlineBlock'

export default {
  name: 'DruxtLayoutBuilderInlineBlockCklbText',
  mixins: [inlineBlock],
  computed: {
    text: ({ attrs }) => (attrs.cklb_text || {}).processed || (attrs.cklb_text || {}).value || '',
  },
}
</script>
