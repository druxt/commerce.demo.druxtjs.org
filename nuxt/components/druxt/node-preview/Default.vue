<template>
  <!-- Any other node: its title over the rendered node, at the store's width. -->
  <article class="wrap py-[clamp(28px,4vw,48px)] flex flex-col gap-6">
    <h1 class="text-[clamp(30px,5vw,44px)] tracking-tight">{{ title }}</h1>
    <slot />
  </article>
</template>

<script>
export default {
  name: 'DruxtNodePreviewDefault',
  props: {
    entity: { type: Object, required: true },
  },
  computed: {
    title: ({ entity }) => (entity.attributes || {}).title || 'Preview',
  },
}
</script>
