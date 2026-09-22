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
        'protocol',
        'playground',
        'e2e',
        'benchmarks',
        'docs',
        'ci',
        'repo',
      ],
    ],
  },
}
