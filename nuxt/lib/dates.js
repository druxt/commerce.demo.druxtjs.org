/**
 * A post's date as Drupal wrote it, in Drupal's own timezone, which JSON:API
 * gives as the timestamp's offset. Read the same way on the server and in any
 * reader's browser, so a computed date hydrates without a mismatch.
 *
 * @param {string} iso - The post's `created` timestamp.
 * @param {string} [month] - The month's style: `short` or `long`.
 * @returns {string} The date, such as "20 Aug 2025", or an empty string.
 */
const postDate = (iso, month = 'short') =>
  iso
    ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-AU', {
        day: 'numeric',
        month,
        year: 'numeric',
        timeZone: 'UTC',
      })
    : ''

module.exports = { postDate }
