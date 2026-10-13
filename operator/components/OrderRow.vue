<template>
  <div :class="order.isNew && 'bg-new-2'">
    <!-- One order: number, who, when, state, total, and what the workflow allows next. -->
    <div class="px-4 py-3 border-b border-line flex flex-col gap-2 md:grid md:grid-cols-[auto_1fr_auto_auto_auto_auto] md:items-center md:gap-x-3.5 md:min-h-13">
      <div class="flex items-center gap-2 font-mono font-600 text-14px">
        #{{ order.number }}
        <span v-if="order.isNew" class="font-mono text-11px bg-teal text-paper px-1.5 py-0.5 rounded-full">new</span>
        <span class="pill md:hidden ml-1" :class="pillClass">{{ stateLabel }}</span>
        <span class="md:hidden ml-auto font-mono text-13px text-ink">{{ order.total }}</span>
      </div>
      <div class="text-14px min-w-0 truncate">{{ order.email || 'anonymous' }}</div>
      <div class="mono">{{ placedAt }}</div>
      <div class="hidden md:block"><span class="pill" :class="pillClass">{{ stateLabel }}</span></div>
      <div class="hidden md:block font-mono text-13px text-ink">{{ order.total }}</div>
      <div class="flex gap-2 md:justify-end">
        <button
          v-for="t in transitions"
          :key="t.id"
          type="button"
          class="btn-ghost btn-sm"
          :disabled="busy"
          @click="$emit('transition', { uuid: order.uuid, to: t.to })"
        >{{ t.label }}</button>
      </div>
    </div>
    <!-- Drupal's answer to the last transition, as it came. -->
    <pre v-if="response" class="m-0 px-4 py-3.5 bg-paper-2 border-b border-line font-mono text-12px leading-relaxed whitespace-pre-wrap text-ink">{{ responseText }}</pre>
  </div>
</template>

<script>
import { transitionsFor, label } from '~/lib/transitions'

export default {
  name: 'OrderRow',

  props: {
    order: { type: Object, required: true },
    busy: { type: Boolean, default: false },
    response: { type: Object, default: null },
  },

  computed: {
    transitions: ({ order }) => transitionsFor(order.state),

    stateLabel: ({ order }) => label(order.state),

    pillClass: ({ order }) =>
      ({
        fulfillment: 'border-teal-3 bg-teal-2 text-teal-4',
        draft: 'border-blue-3 bg-blue-2 text-blue-4',
      })[order.state] || '',

    placedAt: ({ order }) => {
      const when = order.placed ? new Date(order.placed) : order.placedAt ? new Date(order.placedAt) : null
      return when ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
    },

    responseText: ({ response, order }) => {
      if (!response) return ''
      const head = `PATCH /jsonapi/orders/default/${order.uuid.slice(0, 8)}…  { "state": "${response.to}" }`
      if (response.error) return `${head}\n${response.status} · ${response.ms} ms · refused: ${response.error}`
      return `${head}\n${response.status} · ${response.ms} ms · state: ${response.state}\nsocket: order:${order.uuid.slice(0, 8)}… · the visitor's order page moved at the same moment`
    },
  },
}
</script>
