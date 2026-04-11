import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Locale detection ──────────────────────────────────────────────────────────
// Priority: MIGRA_ES_LANG env → OS locale (LANG/LC_ALL) → 'en'

function detectLocale() {
  const override = process.env.MIGRA_ES_LANG;
  if (override) return normalizeLocale(override);

  const osLang =
    process.env.LANG       ||
    process.env.LC_ALL     ||
    process.env.LC_MESSAGES ||
    process.env.LANGUAGE   || '';

  if (/^pt/i.test(osLang)) return 'pt-BR';
  return 'en';
}

function normalizeLocale(raw) {
  // 'pt_BR.UTF-8' → 'pt-BR' | 'en_US.UTF-8' → 'en' | 'pt' → 'pt-BR'
  const s = raw.toLowerCase().replace('_', '-').split('.')[0];
  if (s.startsWith('pt')) return 'pt-BR';
  return 'en';
}

// ── Loader ────────────────────────────────────────────────────────────────────

function loadLocale(name) {
  try {
    const raw = readFileSync(join(__dirname, 'locales', `${name}.json`), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getVal(obj, key) {
  return key
    .split('.')
    .reduce((o, k) => (o != null && typeof o === 'object' ? o[k] : undefined), obj);
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const locale = detectLocale();

const primary  = loadLocale(locale);
const fallback = locale === 'en' ? null : loadLocale('en');

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Translate a dot-notation key.
 * Supports `{varName}` interpolation.
 *
 * @param {string}  key  e.g. 'dashboard.empty_hint'
 * @param {object}  [vars]  e.g. { key: 'N' }
 * @returns {string}
 */
export function t(key, vars) {
  const raw = getVal(primary, key) ??
              (fallback ? getVal(fallback, key) : undefined);
  const str = typeof raw === 'string' ? raw : key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/**
 * Pluralized translation.
 * Looks up `key_one` (count === 1) or `key_other`.
 *
 * @param {string}  key    base key
 * @param {number}  count
 * @param {object}  [vars]
 * @returns {string}
 */
export function tp(key, count, vars) {
  const plural = count === 1 ? `${key}_one` : `${key}_other`;
  return t(plural, { count, ...vars });
}

export default { t, tp, locale };
