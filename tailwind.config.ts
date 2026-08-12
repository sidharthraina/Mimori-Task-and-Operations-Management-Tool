import type { Config } from 'tailwindcss'

// Tailwind's color plugin accepts a function value at runtime (the standard
// CSS-variable pattern from Tailwind's own docs), but its bundled Config type
// only declares string/RecursiveKeyValuePair — hence the cast below.
function withOpacity(variableName: string): string {
  return (({ opacityValue }: { opacityValue?: string }) =>
    opacityValue !== undefined
      ? `rgb(var(${variableName}) / ${opacityValue})`
      : `rgb(var(${variableName}))`) as unknown as string
}

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: withOpacity('--primary'),
        onPrimary: withOpacity('--onPrimary'),
        primaryContainer: withOpacity('--primaryContainer'),
        onPrimaryContainer: withOpacity('--onPrimaryContainer'),

        secondary: withOpacity('--secondary'),
        onSecondary: withOpacity('--onSecondary'),
        secondaryContainer: withOpacity('--secondaryContainer'),
        onSecondaryContainer: withOpacity('--onSecondaryContainer'),

        tertiary: withOpacity('--tertiary'),
        onTertiary: withOpacity('--onTertiary'),
        tertiaryContainer: withOpacity('--tertiaryContainer'),
        onTertiaryContainer: withOpacity('--onTertiaryContainer'),

        error: withOpacity('--error'),
        onError: withOpacity('--onError'),
        errorContainer: withOpacity('--errorContainer'),
        onErrorContainer: withOpacity('--onErrorContainer'),

        success: withOpacity('--success'),
        onSuccess: withOpacity('--onSuccess'),
        successContainer: withOpacity('--successContainer'),
        onSuccessContainer: withOpacity('--onSuccessContainer'),

        warning: withOpacity('--warning'),
        onWarning: withOpacity('--onWarning'),
        warningContainer: withOpacity('--warningContainer'),
        onWarningContainer: withOpacity('--onWarningContainer'),

        background: withOpacity('--background'),
        onBackground: withOpacity('--onBackground'),
        surface: withOpacity('--surface'),
        onSurface: withOpacity('--onSurface'),
        surfaceVariant: withOpacity('--surfaceVariant'),
        onSurfaceVariant: withOpacity('--onSurfaceVariant'),

        outline: withOpacity('--outline'),
        outlineVariant: withOpacity('--outlineVariant'),

        surfaceContainerLowest: withOpacity('--surfaceContainerLowest'),
        surfaceContainerLow: withOpacity('--surfaceContainerLow'),
        surfaceContainer: withOpacity('--surfaceContainer'),
        surfaceContainerHigh: withOpacity('--surfaceContainerHigh'),
        surfaceContainerHighest: withOpacity('--surfaceContainerHighest'),

        inverseSurface: withOpacity('--inverseSurface'),
        inverseOnSurface: withOpacity('--inverseOnSurface'),
        inversePrimary: withOpacity('--inversePrimary'),
      },
      fontFamily: {
        sans: ['var(--font-roboto)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-permanent-marker)', 'cursive'],
        // Page titles and modal/section headings only — single weight (400),
        // no bold cut exists for this font.
        heading: ['var(--font-alata)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        modal: '28px',
      },
      // M3 state-layer opacities (hover 8%, pressed/focus 12%) — not in
      // Tailwind's default opacity scale, so extended here for the `/8` and
      // `/12` modifiers used on interactive surfaces throughout the app.
      opacity: {
        '8': '0.08',
        '12': '0.12',
      },
      boxShadow: {
        'elevation-1': '0 1px 2px 0 rgb(0 0 0 / 0.06), 0 1px 3px 1px rgb(0 0 0 / 0.08)',
        'elevation-2': '0 1px 2px 0 rgb(0 0 0 / 0.08), 0 2px 6px 2px rgb(0 0 0 / 0.10)',
        'elevation-3': '0 1px 3px 0 rgb(0 0 0 / 0.10), 0 4px 8px 3px rgb(0 0 0 / 0.12)',
      },
    },
  },
  plugins: [],
}

export default config
