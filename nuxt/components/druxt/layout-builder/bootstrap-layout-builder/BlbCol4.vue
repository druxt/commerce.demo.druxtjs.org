<template>
  <div>
    <template v-for="slot of Object.keys($scopedSlots)">
      <div :key="slot">
        <slot :name="slot" />
      </div>
    </template>
  </div>
</template>

<script>
export default {
  name: 'DruxtLayoutBuilderLayoutOnecol'
}
</script>
