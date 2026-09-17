import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const compat = new FlatCompat({ baseDirectory: path.dirname(fileURLToPath(import.meta.url)) });
export default [{ ignores: ['.next*/**', 'node_modules/**', 'next-env.d.ts'] }, ...fixupConfigRules(compat.extends('next/core-web-vitals'))];
