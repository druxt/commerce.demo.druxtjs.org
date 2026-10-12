// A hub the handlers can be exercised against: it records what was sent and
// who is in which channel, the way the real hub's API would answer.
export const fakeHub = () => {
  const sent = []
  const rooms = new Map()
  const hub = {
    sent,
    rooms,
    send: (client, type, channel, payload) => sent.push({ to: client.id, type, channel, payload }),
    broadcast: (channel, type, payload) => sent.push({ to: `*${channel}`, type, channel, payload }),
    members: (channel) => [...(rooms.get(channel) || [])],
    // The real hub adds the client, then calls the handler's join.
    enter: async (handler, channel, client) => {
      if (!rooms.has(channel)) rooms.set(channel, new Set())
      rooms.get(channel).add(client)
      if (handler.join) await handler.join(hub, channel, client)
    },
    exit: async (handler, channel, client) => {
      ;(rooms.get(channel) || new Set()).delete(client)
      if (handler.leave) await handler.leave(hub, channel, client)
    },
  }
  return hub
}

export const client = (id) => ({ id, name: id, channels: new Set(), roles: {} })

export const errorsTo = (hub, id) =>
  hub.sent.filter((m) => m.to === id && m.type === 'error').map((m) => m.payload.message)
