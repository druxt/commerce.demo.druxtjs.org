<template>
  <DruxtLayoutBuilder :entity="entity" />
</template>

<script>
import { DruxtEntityMixin } from 'druxt-entity'
export default {
  mixins: [DruxtEntityMixin]
}
</script>
