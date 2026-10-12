import { defineConfig, presetUno } from 'unocss'

// The storefront's tokens, plus the console's own neutrals. The console is a
// tool, so its ground is cooler and its bar is dark, as the design frames it.
export default defineConfig({
  presets: [presetUno()],

  theme: {
    colors: {
      ink: '#1f2937',
      'ink-2': '#4b5563',
      paper: '#ffffff',
      'paper-2': '#f4f7fa',
      line: '#dbe3ec',
      neutral: '#3d4451',
      accent: '#036397',
      'accent-2': '#024a72',
      teal: '#009485',
      'teal-2': '#e6f7f4',
      'teal-3': '#9fe0d6',
      'teal-4': '#0b6b5b',
      'blue-2': '#eaf5fc',
      'blue-3': '#bfe0f7',
      'blue-4': '#0c4a6e',
      'new-2': '#eef8f3',
      'err-1': '#fff1ec',
      'err-2': '#ffb59b',
      'err-3': '#9a3412',
    },
    borderRadius: {
      DEFAULT: '8px',
      lg: '16px',
      full: '999px',
      none: '0',
    },
    fontFamily: {
      sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    },
  },

  shortcuts: {
    btn: 'inline-flex items-center justify-center gap-2 h-11 px-4.5 rounded border text-14px font-600 whitespace-nowrap cursor-pointer transition-colors duration-150 disabled:opacity-50 disabled:cursor-default',
    'btn-primary': 'btn bg-accent text-paper border-accent hover:bg-accent-2 hover:border-accent-2',
    'btn-ghost': 'btn bg-paper text-accent border-accent hover:bg-paper-2',
    'btn-sm': 'h-9 px-3 text-13px',
    card: 'bg-paper border border-line rounded-lg overflow-hidden',
    field:
      'h-11 px-3 w-full bg-paper border border-line rounded text-16px text-ink focus:border-accent focus:outline-none',
    lbl: 'flex flex-col gap-1.5 text-13px text-ink-2 font-500',
    mono: 'font-mono text-12px text-ink-2 leading-relaxed',
    live: 'inline-flex items-center gap-1.5 font-mono text-12px text-teal font-600',
    pill: 'font-mono text-11px px-2 py-0.5 rounded-full border border-line text-ink-2 whitespace-nowrap',
    lead: 'text-14px text-ink-2 leading-relaxed max-w-64ch mb-5',
    h1: 'text-24px font-700 tracking-tight flex items-center gap-3 flex-wrap mb-1',
  },

  safelist: [],
})
