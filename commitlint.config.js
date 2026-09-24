export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'laravel',
        'core',
        'vue',
        'react',
        'vite',
        'protocol',
        'playground',
        'e2e',
        'benchmarks',
        'docs',
        'ci',
        'repo',
        'development',
        'deps',
      ],
    ],
  },
}
