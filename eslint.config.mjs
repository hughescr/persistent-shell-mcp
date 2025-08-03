import defaultConfig from '@hughescr/eslint-config-default';
import packageJson from 'eslint-plugin-package-json';

export default
[
    {
        name: 'ignores',
        ignores: ['coverage', 'node_modules'],
    },
    defaultConfig.configs.recommended,
    {
        rules: {
            'no-console': 'off',
            '@stylistic/operator-linebreak': 'off',
            'n/no-missing-import': 'off',
            'lodash/prefer-noop': 'off',
            'lodash/prefer-lodash-method': 'off',
        },
    },
    {
        ...packageJson.configs.recommended,
        rules: {
            ...packageJson.configs.recommended.rules,
            strict: 'off',
        }
    },
];
