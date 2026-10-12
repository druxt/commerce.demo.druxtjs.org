<template>
  <h2 v-if="title" class="text-3xl sm:text-4xl">{{ title }}</h2>
</template>

<script>
import inlineBlock from '~/mixins/inlineBlock'

export default {
  name: 'DruxtLayoutBuilderInlineBlockCklbTitle',
  mixins: [inlineBlock],
  computed: {
    title: ({ attrs }) => attrs.cklb_title,
  },
}
</script>
