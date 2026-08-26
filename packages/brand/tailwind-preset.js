/** @type {import('tailwindcss').Config} */
/* Hojaldras Lily — mismos nombres de clase (sa-*), valores del Manual v1.0. */
export default {
  theme: {
    extend: {
      colors: {
        sa: {
          green:       '#D81B4A',
          'green-deep': '#A8123A',
          'green-ink':  '#4A3A52',
          cream:        '#FDF6E3',
          'cream-soft': '#FFFBF2',
          'cream-paper':'#FFFCF5',
          'cream-warm': '#F3E3CE',
          strawberry:   '#F49CAC',
          banana:       '#D9944B',
          chocolate:    '#6B4A33',
          mango:        '#E88B5A',
          blueberry:    '#8A6BA0',
          mint:         '#4E7A56',
          coconut:      '#FAD9CE',
          coffee:       '#4A3A52',
        },
      },
      fontFamily: {
        display: ['"Jost"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        body:    ['"Karla"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono:    ['"DM Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans:    ['"Karla"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        script:  ['"Yellowtail"', 'cursive'],
      },
      boxShadow: {
        sa: '0 2px 10px rgba(74, 58, 82, 0.12)',
        'sa-sm': '0 1px 5px rgba(74, 58, 82, 0.12)',
      },
      borderRadius: {
        'sa': '12px',
        'sa-lg': '18px',
      },
    },
  },
}
