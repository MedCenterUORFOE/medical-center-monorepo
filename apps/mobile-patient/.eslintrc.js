//apps/mobile-patient/.eslintrc.js
module.exports = {
  extends: 'expo',
  ignorePatterns: ['dist/*'],
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json'
      }
    }
  },
  rules: {
    'import/namespace': 'off',
    'import/no-unresolved': 'off',
    '@typescript-eslint/no-explicit-any': 'error'
  }
};