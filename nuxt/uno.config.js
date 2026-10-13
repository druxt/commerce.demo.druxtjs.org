import { defineConfig, presetUno } from 'unocss'

// The design token set. Every colour and radius in the storefront resolves
// through here: components carry no literal hex values, so a token change
// propagates without editing a single component.
export default defineConfig({
  presets: [presetUno()],

  theme: {
    colors: {
      ink: '#101214',       // Body text, buttons, header, footer
      'ink-2': '#5b6169',   // Secondary text, labels
      'ink-3': '#9aa0a6',   // Meta, counts, mono captions
      paper: '#ffffff',     // Cards, header, panels
      'paper-2': '#f7f6f3', // Page ground
      'paper-3': '#fbfaf8', // Sunk panels, summary rows
      line: '#e4e2dd',      // Every border
      'line-2': '#d6d2ca',  // Emphasised border
      accent: '#0678be',    // Links and text actions (Druxt blue)
      mint: '#7fd4c1',      // On-dark accent
      teal: '#108775',      // Success
      warn: '#b45309',      // Low stock
    },

    // The design is square. One radius, used everywhere.
    borderRadius: {
      DEFAULT: '2px',
      none: '0',
    },

    fontFamily: {
      sans: 'Archivo, "Helvetica Neue", Arial, sans-serif',
      mono: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
    },
  },

  shortcuts: {
    // Interactive targets are 44px minimum, so they stay reachable on touch.
    'btn': 'inline-flex items-center justify-center gap-2 h-11 px-5 text-sm font-600 rounded border transition-colors duration-150 no-underline cursor-pointer',
    'btn-primary': 'btn bg-ink text-paper border-ink hover:bg-ink-2 hover:border-ink-2',
    'btn-secondary': 'btn bg-paper text-ink border-line-2 hover:border-ink',
    'label-mono': 'font-mono text-11px tracking-widest uppercase text-ink-3',
    'card': 'bg-paper border border-line rounded',
    'field': 'h-11 px-3 bg-paper border border-line rounded text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none',
  },

  // Nothing in the app is authored with arbitrary hex values, so the safelist
  // stays empty on purpose rather than papering over dynamic class names.
  safelist: [],
})
