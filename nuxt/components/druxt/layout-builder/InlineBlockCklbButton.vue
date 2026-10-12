<template>
  <component
    :is="external ? 'a' : 'NuxtLink'"
    v-if="path"
    v-bind="external ? { href: path, rel: 'noopener', target: '_blank' } : { to: path }"
    class="btn-primary"
  >{{ title }}</component>
</template>

<script>
import inlineBlock from '~/mixins/inlineBlock'

export default {
  name: 'DruxtLayoutBuilderInlineBlockCklbButton',
  mixins: [inlineBlock],
  computed: {
    cta: ({ attrs }) => attrs.cklb_cta || {},
    path() { return this.linkPath(this.cta) },
    title: ({ cta }) => cta.title || 'Find out more',
    external: ({ path }) => !!path && /^https?:\/\//.test(path),
  },
}
</script>
