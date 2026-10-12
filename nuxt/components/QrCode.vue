<template>
  <img v-if="src" :src="src" :alt="alt" :width="size" :height="size" class="rounded border-6 border-paper outline outline-1 outline-line bg-paper">
</template>

<script>
import { toDataURL } from 'qrcode'

export default {
  name: 'QrCode',

  props: {
    value: { type: String, required: true },
    alt: { type: String, default: 'QR code' },
    size: { type: Number, default: 140 },
  },

  data: () => ({ src: '' }),

  watch: {
    value: { immediate: true, handler: 'draw' },
    size: 'draw',
  },

  methods: {
    async draw() {
      this.src = this.value ? await toDataURL(this.value, { width: this.size * 2, margin: 1 }) : ''
    },
  },
}
</script>
