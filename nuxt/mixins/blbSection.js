/**
 * Render a Bootstrap Layout Builder section the way Drupal configured it.
 *
 * The section data carries the editor's real choices: `layout_regions_classes`
 * holds the per-region column classes (`col-lg-9` beside `col-lg-3`, say),
 * `container` says whether the row is contained or full bleed, and
 * `remove_gutters` controls the gutter. Earlier these components were three
 * hand-written grids with fixed even splits, so a 9/3 section rendered 50/50
 * and the editor's setting was silently discarded.
 *
 * Reading the settings instead means one implementation covers every
 * `blb_col_*` layout, including ones nobody has hand-coded, and the classes
 * resolve against the Belgrade-derived stylesheet.
 */
export default {
  props: {
    section: { type: Object, required: true },
  },

  computed: {
    settings: ({ section }) => section.layout_settings || {},

    // Region order comes from the settings, not from the component array: a
    // component in the right-hand column can be first in the data, and
    // rendering in that order would swap the columns.
    regions() {
      const classes = this.settings.layout_regions_classes || {}
      const names = Object.keys(classes)
      if (names.length) return names
      // Single-column layouts carry no per-region classes.
      return Object.keys(this.settings.regions_classes || { blb_region_col_1: '' })
    },

    // Slot names are `component-<index>`, so each region needs the indices of
    // the components assigned to it, in weight order.
    slotsByRegion() {
      const components = this.section.components || []
      return this.regions.reduce((acc, region) => {
        acc[region] = components
          .map((component, index) => ({ component, index }))
          .filter(({ component }) => (component.region || this.regions[0]) === region)
          .sort((a, b) => (a.component.weight || 0) - (b.component.weight || 0))
          .map(({ index }) => `component-${index}`)
        return acc
      }, {})
    },

    containerClass: ({ settings }) => settings.container || 'container',

    rowClass: ({ settings }) => ['row', settings.remove_gutters === '1' ? 'g-0' : '']
      .filter(Boolean).join(' '),

    sectionClass: ({ settings }) => settings.section_classes || '',
  },

  methods: {
    regionClass(region) {
      const columns = (this.settings.layout_regions_classes || {})[region] || []
      const extra = (this.settings.regions_classes || {})[region] || ''
      // A layout with no column classes is a single full-width region.
      return [...(columns.length ? columns : ['col-12']), extra].filter(Boolean).join(' ')
    },
  },
}
