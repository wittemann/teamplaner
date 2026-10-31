// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', '.vercel/', '.astro/', 'coverage/', 'mockup/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  { rules: { '@typescript-eslint/consistent-type-definitions': ['error', 'type'] } },
  // Explicit return types only where they earn it; those carry a disable comment
  {
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: ':function[returnType]:not([returnType.typeAnnotation.type="TSTypePredicate"])',
          message: 'Let TypeScript infer the return type (siehe CLAUDE.md).',
        },
      ],
    },
  },
  { languageOptions: { globals: { ...globals.node } } },
);
