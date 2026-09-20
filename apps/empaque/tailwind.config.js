import brandPreset from '@shake/brand/tailwind-preset'

/** @type {import('tailwindcss').Config} */
export default {
  presets: [brandPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  plugins: [],
}
