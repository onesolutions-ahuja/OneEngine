export default [
  {
    files: ['src/**/*.{js,jsx}', 'services/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', Image: 'readonly', BroadcastChannel: 'readonly',
        AbortSignal: 'readonly', AbortController: 'readonly', fetch: 'readonly', console: 'readonly',
        atob: 'readonly', btoa: 'readonly', crypto: 'readonly', indexedDB: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        structuredClone: 'readonly', FormData: 'readonly', FileReader: 'readonly',
        Blob: 'readonly', Event: 'readonly', CustomEvent: 'readonly',
        Node: 'readonly', HTMLElement: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
    },
  },
]
