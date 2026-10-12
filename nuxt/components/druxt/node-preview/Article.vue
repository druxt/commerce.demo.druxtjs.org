<template>
  <!-- The article view draws its own page, so the preview adds nothing around it. -->
  <div>
    <slot />
  </div>
</template>

<script>
export default {
  name: 'DruxtNodePreviewArticle',
}
</script>
