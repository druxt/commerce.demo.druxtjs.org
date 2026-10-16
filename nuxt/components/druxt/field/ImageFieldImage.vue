<template>
  <figure v-if="images.length" class="mx-auto max-w-[1040px] m-0">
    <img v-for="image in images" :key="image.src" :src="image.src" :alt="image.alt" class="block w-full aspect-[16/9] object-cover bg-paper-3">
  </figure>
</template>

<script>
import DruxtFieldImage from './Image.vue'

// A blog post's image, as the wide figure under its title.
export default {
  name: 'DruxtFieldImageFieldImage',
  extends: DruxtFieldImage,
}
</script>
