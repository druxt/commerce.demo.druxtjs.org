<template>
  <NuxtLink
    :to="path"
    class="card overflow-hidden flex flex-col group hover:border-line-2 transition-colors duration-150"
  >
    <div class="aspect-square bg-paper-3 overflow-hidden">
      <img
        v-if="image"
        :src="image"
        :alt="title"
        loading="lazy"
        class="w-full h-full object-cover"
      >
      <!-- A product with no image still holds its space, so the grid does not
           reflow around it. -->
      <div v-else class="w-full h-full flex items-center justify-center label-mono">
        no image
      </div>
    </div>

    <div class="p-4 flex flex-col gap-1.5 border-t border-line">
      <p v-if="collection" class="label-mono">{{ collection }}</p>
      <h3 class="text-15px font-600 leading-snug group-hover:underline">{{ title }}</h3>
      <p v-if="price" class="text-sm font-600 tabular-nums">{{ price }}</p>
    </div>
  </NuxtLink>
</template>

<script>
export default {
  name: 'ProductCard',

  props: {
    title: { type: String, required: true },
    path: { type: String, required: true },
    // Drupal's formatted price string, used as given. Commerce owns currency,
    // rounding and locale; composing it here would diverge the moment a second
    // currency or a tax rule appears.
    price: { type: String, default: '' },
    image: { type: String, default: '' },
    collection: { type: String, default: '' },
  },
}
</script>
