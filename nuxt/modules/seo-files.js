import fs from 'fs'
import path from 'path'
import axios from 'axios'

/**
 * What search engines, share cards and assistants read. The router's route
 * renders components/DruxtPage.vue, which gives every Drupal path the
 * storefront's head. On `generate:done`, robots.txt, sitemap.xml, llms.txt
 * and llms-full.txt go into the export, built from the routes the run wrote
 * and from Drupal's content.
 */
export default function () {
  // Registered after druxt-site, whose router module adds the route.
  this.extendRoutes((routes) => {
    for (const route of routes) {
      if (String(route.name || '').startsWith('druxt-router')) {
        route.component = path.resolve(this.options.srcDir, 'components/DruxtPage.vue')
      }
    }
  })

  this.nuxt.hook('generate:done', async (generator) => {
    const { siteOrigin } = require('../lib/site')
    const { readContent } = require('../lib/seo-content')
    const { buildLlmsTxt } = require('../lib/llms-txt')
    const { buildLlmsFullTxt } = require('../lib/llms-full-txt')
    const { buildSitemap, buildRobots } = require('../lib/sitemap')

    const origin = siteOrigin()
    const dir = generator.nuxt.options.generate.dir
    const get = async (url) => (await axios.get(url, { headers: { Accept: 'application/vnd.api+json' } })).data
    const docs = await readContent(this.options.druxt.baseUrl, get)
    const routes = [...(generator.generatedRoutes || [])]

    const files = {
      'robots.txt': buildRobots({ origin }),
      'sitemap.xml': buildSitemap(routes, { origin }),
      'llms.txt': buildLlmsTxt(docs, { origin }),
      'llms-full.txt': buildLlmsFullTxt(docs, { origin }),
    }
    for (const [name, body] of Object.entries(files)) {
      await fs.promises.writeFile(path.join(dir, name), body)
    }
    console.info(
      `seo-files: wrote ${Object.keys(files).join(', ')} for ${routes.length} routes and ${docs.length} documents at ${origin}`
    )
  })
}
