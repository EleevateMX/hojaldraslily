/** @type {import('tailwindcss').Config} */
/* Hojaldras Lily — mismos nombres de clase (sa-*), valores del Manual v1.0. */
export default {
  theme: {
    extend: {
      colors: {
        sa: {
          green:       '#C4463C',
          'green-deep': '#A2372F',
          'green-ink':  '#2E2420',
          cream:        '#F8EDD5',
          'cream-soft': '#FCF6EA',
          'cream-paper':'#FFFDF8',
          'cream-warm': '#EDE3D2',
          strawberry:   '#C2186B',
          banana:       '#C98A4B',
          chocolate:    '#5C3825',
          mango:        '#D97B3F',
          blueberry:    '#8A6BA0',
          mint:         '#4E7A56',
          coconut:      '#F6D8CD',
          coffee:       '#3F2A1F',
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
        sa: '0 2px 8px rgba(46, 36, 32, 0.10)',
        'sa-sm': '0 1px 4px rgba(46, 36, 32, 0.10)',
      },
      borderRadius: {
        'sa': '12px',
        'sa-lg': '18px',
      },
    },
  },
}
