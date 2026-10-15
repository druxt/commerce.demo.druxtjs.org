/**
 * Names for visitors on the hub. The sockets package's own pool is Umami's
 * and reads as food; this store's reads as a shop. A name is drawn from the
 * client's id, so the same tab keeps its name across a reconnect, and a
 * signed-in operator keeps their account name.
 */
const ADJECTIVES = [
  'Brisk',
  'Candid',
  'Early',
  'Keen',
  'Mellow',
  'Plain',
  'Quiet',
  'Steady',
  'Tidy',
  'Bright',
  'Patient',
  'Nimble',
  'Sunny',
  'Thrifty',
  'Upright',
  'Woven',
]

const NOUNS = [
  'Fedora',
  'Flamingo',
  'Lantern',
  'Satchel',
  'Candle',
  'Stool',
  'Hatbox',
  'Teapot',
  'Ledger',
  'Compass',
  'Pillow',
  'Poster',
  'Beachball',
  'Sweater',
  'Armchair',
  'Headphones',
  'Receipt',
  'Trolley',
  'Parcel',
  'Mannequin',
]

/** A small stable hash of a string. */
const hash = (text) => {
  let h = 2166136261
  for (const c of String(text)) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/**
 * The hub's `name(user, client)`: a signed-in account's own name, else a
 * shop name drawn from the client's id.
 */
const nameFor = (user, client = {}) => {
  const account = user && (user.preferred_username || user.name)
  if (account) return String(account)
  const h = hash(client.id || Math.random())
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length]}`
}

module.exports = { nameFor, ADJECTIVES, NOUNS }
