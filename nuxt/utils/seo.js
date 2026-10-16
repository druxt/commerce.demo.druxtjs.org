import {
  SITE_NAME,
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_CARD,
  SITE_LOGO,
  TWITTER_HANDLE,
  canonicalUrl,
  absolute,
} from '~/lib/site'

// Google cuts a description at around 160 characters.
const DESCRIPTION_LIMIT = 160

/** Kept out of search: one visitor's cart, checkout or order. */
export const NOINDEX = { hid: 'robots', name: 'robots', content: 'noindex' }

/** Text without its markup, whitespace collapsed. */
export const plainText = (html) =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

/** A description cut to a whole word within the limit. */
export const clampDescription = (text) => {
  const value = plainText(text)
  if (value.length <= DESCRIPTION_LIMIT) return value
  const cut = value.slice(0, DESCRIPTION_LIMIT)
  const space = cut.lastIndexOf(' ')
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[,;:.]$/, '') + '…'
}

const organizationGraph = (origin) => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: origin + '/',
  logo: origin + SITE_LOGO,
})

const websiteGraph = (origin) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: origin + '/',
  description: SITE_DESCRIPTION,
})

/**
 * A page's head, as the Umami demo and druxtjs.org write theirs: one
 * description, Open Graph and Twitter cards, a canonical link and the
 * structured data. Components lower in the tree replace these by hid.
 */
export function seoHead({ origin, path, title, description, image, type = 'website', robots, graphs = [] }) {
  const url = canonicalUrl(origin, path)
  const heading = title || SITE_TITLE
  const summary = clampDescription(description || SITE_DESCRIPTION)
  const shareImage = absolute(origin, image || SITE_CARD)
  const shareTitle = `${heading} · ${SITE_NAME}`

  return {
    title: heading,
    meta: [
      { hid: 'description', name: 'description', content: summary },
      ...(robots ? [{ hid: 'robots', name: 'robots', content: robots }] : []),

      { hid: 'og:type', property: 'og:type', content: type },
      { hid: 'og:title', property: 'og:title', content: shareTitle },
      { hid: 'og:description', property: 'og:description', content: summary },
      { hid: 'og:url', property: 'og:url', content: url },
      { hid: 'og:image', property: 'og:image', content: shareImage },
      { hid: 'og:site_name', property: 'og:site_name', content: SITE_NAME },
      // The card is 1200x630. A photograph's size is unknown, so these are
      // skipped for one, which removes the layout's as well.
      { hid: 'og:image:width', property: 'og:image:width', content: '1200', skip: Boolean(image) },
      { hid: 'og:image:height', property: 'og:image:height', content: '630', skip: Boolean(image) },

      { hid: 'twitter:card', name: 'twitter:card', content: 'summary_large_image' },
      { hid: 'twitter:site', name: 'twitter:site', content: TWITTER_HANDLE },
      { hid: 'twitter:title', name: 'twitter:title', content: shareTitle },
      { hid: 'twitter:description', name: 'twitter:description', content: summary },
      { hid: 'twitter:image', name: 'twitter:image', content: shareImage },
    ],
    link: [{ hid: 'canonical', rel: 'canonical', href: url }],
    script: [
      { hid: 'ld-organization', type: 'application/ld+json', json: organizationGraph(origin) },
      { hid: 'ld-website', type: 'application/ld+json', json: websiteGraph(origin) },
      ...graphs.map((json, i) => ({ hid: `ld-page-${i}`, type: 'application/ld+json', json })),
    ],
  }
}

/** The trail a page's breadcrumb shows, ending with the page itself. */
export const breadcrumbGraph = (origin, trail) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(({ name, path }, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    item: absolute(origin, path),
  })),
})

/** Stock as schema.org has it, or nothing when Drupal doesn't give a level. */
const availability = (stock) =>
  typeof stock !== 'number' ? undefined : `https://schema.org/${stock > 0 ? 'InStock' : 'OutOfStock'}`

/**
 * A product and its variations' offers, from the catalogue item the page
 * renders: the price Commerce resolved, its currency and the stock level.
 */
export const productGraph = ({ origin, url, item, description }) => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: item.title,
  description,
  url,
  sku: item.sku || undefined,
  image: item.images.map((image) => absolute(origin, image)),
  brand: item.brand ? { '@type': 'Brand', name: item.brand } : undefined,
  category: item.category || undefined,
  offers: item.variations.map((v) => ({
    '@type': 'Offer',
    name: v.title,
    sku: v.sku,
    price: v.amount.toFixed(2),
    priceCurrency: v.currency,
    availability: availability(v.stock),
    url,
  })),
})

/** A blog post, with the dates Drupal holds and the store as its publisher. */
export const articleGraph = ({ origin, url, title, description, image, created, changed, tags }) => {
  const publisher = { '@type': 'Organization', name: SITE_NAME, url: origin + '/' }
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    url,
    mainEntityOfPage: url,
    image: image ? absolute(origin, image) : undefined,
    datePublished: created,
    dateModified: changed,
    keywords: tags.length ? tags.join(', ') : undefined,
    author: publisher,
    publisher,
  }
}
