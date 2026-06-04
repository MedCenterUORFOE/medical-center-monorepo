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
    'import/no-unresolved': 'off'
  }
};