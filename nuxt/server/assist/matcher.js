/**
 * The scripted concierge: keyword buckets over Commerce Kickstart's real
 * SKUs. It answers when the model is absent, slow, over budget or wrong,
 * and it is what the demo runs on when the network is bad at a conference.
 * Every pick is checked against the catalogue the server built, so a SKU
 * that left the store leaves the answer. `means` is the bucket in a
 * sentence, for the intent model that picks a bucket by meaning.
 */
const pick = (sku, why) => ({ sku, why })

const BUCKETS = [
  {
    key: 'pair',
    means: 'Wants things that go with something they already bought',
    words: ['pair', 'pairs', 'goes with', 'go with', 'match', 'alongside'],
    note: 'Things that go outside with it.',
    picks: [
      pick('UT-KnitHat-Green', 'Cold mornings, same head'),
      pick('PT-GiganticFlamingo-001', 'Same pool, same afternoon'),
      pick("book-gulliver's-travels-hard-copy", 'Something to read under the brim'),
    ],
  },
  {
    key: 'read',
    means: 'Wants a book or something to read',
    words: ['read', 'book', 'books', 'novel', 'flight', 'plane', 'train', 'story', 'stories', 'classic'],
    note: 'All three classics come as a hard copy or a digital download.',
    picks: [
      pick('book-sherlock-holmes-hard-copy', 'Twelve short stories, easy to dip into'),
      pick('book-alice-hard-copy', 'Short, and the digital copy takes no space'),
      pick("book-gulliver's-travels-hard-copy", 'Four voyages for one long flight'),
    ],
  },
  {
    key: 'seating',
    means: 'Wants chairs, stools or somewhere to sit or eat',
    words: ['chair', 'chairs', 'seat', 'seats', 'stool', 'dining', 'kitchen', 'table', 'sit'],
    note: 'Seating, cheapest to dearest.',
    picks: [
      pick('WoodCo-BBS-001', 'Tucks under a bench'),
      pick('000002', 'One chair, a lot of pink'),
      pick('MF-WhiteWoodChair-001', 'The dearest seat in the store'),
    ],
  },
  {
    key: 'desk',
    means: 'Wants to set up a desk or workspace at home',
    words: ['desk', 'work', 'wfh', 'office', 'study', 'home office'],
    note: 'A desk, a chair and one thing for the wall.',
    picks: [
      pick('whttbl', 'A desk with nothing on it yet'),
      pick('blkchr', 'Mesh, for long afternoons'),
      pick('FoggyForest-24x36', 'Something calm above the screen'),
    ],
  },
  {
    key: 'gift',
    means: 'Wants a small, inexpensive gift',
    words: ['gift', 'present', 'cheap', 'under', 'budget', '$', 'dollars', 'small'],
    note: 'All under thirty, all safe bets.',
    picks: [
      pick('3plantpots', 'Ten dollars, three pots'),
      pick('candle4', 'Four candles, one box'),
      pick('UT-KnitHat-Green', 'Warm and under thirty'),
    ],
  },
  {
    key: 'warm',
    means: 'Wants warm clothes or a hat',
    words: ['warm', 'cold', 'winter', 'hat', 'knit', 'wear', 'jumper', 'sweatshirt', 'clothes'],
    note: 'Warm things to wear.',
    picks: [
      pick('UT-KnitHat-Green', 'Green, knitted, one size'),
      pick('UT-KnitHat-MNPlum', 'The same hat in plum'),
      pick('whtsh', 'Fifteen dollars of sweatshirt'),
    ],
  },
  {
    key: 'outdoors',
    means: 'Wants things for children, the beach, the pool or summer outside',
    words: ['summer', 'hot', 'outdoor', 'outdoors', 'pool', 'beach', 'kid', 'kids', 'child', 'children', 'sun', 'garden'],
    note: 'For being outside in it.',
    picks: [
      pick('PT-GiganticFlamingo-001', 'Gigantic, inflatable, pink'),
      pick('PT-Classic36-001', 'A beach ball, the classic one'),
      pick('NYT-CocoaFedora-001', 'Shade for the grown-up'),
    ],
  },
  {
    key: 'wall',
    means: 'Wants art or prints to decorate a wall',
    words: ['wall', 'print', 'prints', 'art', 'poster', 'picture', 'decor', 'decorate'],
    note: 'Three prints, one wall.',
    picks: [
      pick('HotAirBalloon-24x36', 'Balloons, for a hallway'),
      pick('Flowers-001', 'Flowers, for a bedroom'),
      pick('HidingGoat-24x30', 'A goat, for the room that needs one'),
    ],
  },
  {
    key: 'scent',
    means: 'Wants perfume or something that smells nice',
    words: ['perfume', 'scent', 'fragrance', 'beauty', 'her', 'mum', 'mother', 'smell'],
    note: 'Scent, in two bottles and a candle.',
    picks: [
      pick('Dior-MDEDT-50', 'The lighter of the two'),
      pick('Chloe-EDP-50', 'The one that lasts the evening'),
      pick('candle4', 'Scent for the room instead'),
    ],
  },
  {
    key: 'listen',
    means: 'Wants headphones or something to listen to music with',
    words: ['music', 'listen', 'headphones', 'audio', 'tech', 'electrical', 'sound', 'podcast'],
    note: 'Something to listen with, and to read.',
    picks: [
      pick('level-headphones', 'Wired or Bluetooth, over the ear'),
      pick('book-alice-digital-download', 'Something to read between albums'),
      pick('whtsh', 'Comfortable for a long listen'),
    ],
  },
  {
    key: 'default',
    means: 'Is just browsing or has not said what they want',
    words: [],
    note: 'The three things people buy most often.',
    picks: [
      pick('PT-GiganticFlamingo-001', 'The thing people buy most'),
      pick('MF-WhiteWoodChair-001', 'The dearest, and the most looked at'),
      pick('UT-KnitHat-Green', 'The one that fits in a bag'),
    ],
  },
]

const CHIPS = ['A gift under $40', 'Furnishing a dining room', 'Something to read', 'For a kid, outdoors', 'Talk to a person']

/** Whether a word or phrase occurs in the text as a whole word. */
const has = (text, word) => {
  if (word === '$') return text.includes('$')
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text)
}

/**
 * The bucket a message lands in, with its picks kept to the catalogue.
 *
 * @param {string} message - What the shopper said.
 * @param {Array<{sku: string}>} catalogue - The server's compact catalogue.
 * @param {string} [bucket] - A bucket already chosen, by the intent model; the keywords otherwise.
 * @returns {{note: string, picks: Array<{sku: string, why: string}>, bucket: string}}
 */
const match = (message, catalogue = [], bucket) => {
  const text = String(message || '').toLowerCase()
  const known = new Set(catalogue.map((c) => c.sku))
  const keep = (b) => b.picks.filter((p) => known.has(p.sku))
  const found = bucket ? BUCKETS.find((b) => b.key === bucket) : BUCKETS.find((b) => b.words.some((w) => has(text, w)))
  const fallback = BUCKETS[BUCKETS.length - 1]
  if (found && keep(found).length) return { note: found.note, picks: keep(found), bucket: found.key }
  const picks = keep(fallback)
  return { note: fallback.note, picks: picks.length ? picks : fallback.picks, bucket: 'default' }
}

module.exports = { match, BUCKETS, CHIPS }
