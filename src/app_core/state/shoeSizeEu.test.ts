import { normalizeShoeSizeEu, parseShoeSizeEuInput } from './shoeSizeEu';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

assertEqual(parseShoeSizeEuInput('42'), 42, 'integer size');
assertEqual(parseShoeSizeEuInput('42.5'), 42.5, 'dot size');
assertEqual(parseShoeSizeEuInput('42,5'), 42.5, 'comma size');
assertEqual(parseShoeSizeEuInput(''), null, 'empty optional size');
assertEqual(parseShoeSizeEuInput('abc'), null, 'invalid size');
assertEqual(parseShoeSizeEuInput('29.5'), null, 'small size');
assertEqual(parseShoeSizeEuInput('55.5'), null, 'large size');
assertEqual(normalizeShoeSizeEu(undefined), null, 'legacy profile without shoe size');
