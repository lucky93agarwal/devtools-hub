/** Turning JSON keys into names that are valid and look natural in each language. */

/** Splits "user_id", "userID", "User-Name 2" and so on into lower-case words. */
export function words(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** "user_address" to "UserAddress". Empty or symbol-only keys become "Field". */
export function pascalCase(key: string): string {
  return words(key).map(capital).join('') || 'Field';
}

/** "user_address" to "userAddress". */
export function camelCase(key: string): string {
  const name = pascalCase(key);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** "userAddress" to "user_address". */
export function snakeCase(key: string): string {
  return words(key).join('_') || 'field';
}

/** "users" to "user", "categories" to "category", for naming the items of a list. */
export function singular(name: string): string {
  if (/ies$/i.test(name) && name.length > 4) return name.slice(0, -3) + (name.endsWith('IES') ? 'Y' : 'y');
  if (/(ss|us|is|ics)$/i.test(name)) return name;
  if (/(x|ch|sh|sses)es$/i.test(name)) return name.slice(0, -2);
  if (/[^s]s$/i.test(name) && name.length > 3) return name.slice(0, -1);
  return name;
}

/** Names cannot start with a digit in any of the target languages. */
export function noLeadingDigit(name: string, prefix = '_'): string {
  return /^[0-9]/.test(name) ? prefix + name : name;
}

/**
 * Gives each name a unique spelling by adding 2, 3 and so on, for example two keys
 * "user_id" and "userId" that would both become "userId".
 */
export function makeUnique(names: readonly string[], taken: Iterable<string> = []): string[] {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${name}${n}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/** JSON string literal for annotations such as @SerialName("user_id"). */
export const quote = (text: string) => JSON.stringify(text);
