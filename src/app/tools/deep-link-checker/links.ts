/**
 * Android App Links and iOS Universal Links: makes and checks assetlinks.json and apple-app-site-association,
 * the Android intent filter, and commands to open a link on an emulator or simulator.
 */

export interface Issue {
  level: 'error' | 'warning';
  message: string;
}

const PACKAGE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const TEAM_ID = /^[A-Z0-9]{10}$/;

/** Accepts fingerprints with or without colons, in any case, as Play Console and keytool print them. */
export function normalizeFingerprint(text: string): string {
  const hex = text.replace(/[^0-9a-f]/gi, '').toUpperCase();
  return hex.length === 64 ? hex.match(/../g)!.join(':') : text.trim().toUpperCase();
}

export function assetLinks(packageName: string, fingerprints: string[], loginSharing = false): string {
  const relation = ['delegate_permission/common.handle_all_urls', ...(loginSharing ? ['delegate_permission/common.get_login_creds'] : [])];
  return (
    JSON.stringify(
      [{ relation, target: { namespace: 'android_app', package_name: packageName.trim(), sha256_cert_fingerprints: fingerprints.map(normalizeFingerprint).filter(Boolean) } }],
      null,
      2,
    ) + '\n'
  );
}

export function checkAssetLinks(text: string): Issue[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return [{ level: 'error', message: `Not valid JSON: ${(error as Error).message}` }];
  }
  if (!Array.isArray(data)) return [{ level: 'error', message: 'The file must be a JSON array of statements ([ … ]).' }];
  const issues: Issue[] = [];
  data.forEach((s: { relation?: unknown; target?: Record<string, unknown> }, i) => {
    const at = `Statement ${i + 1}`;
    if (!Array.isArray(s.relation) || !s.relation.includes('delegate_permission/common.handle_all_urls')) {
      issues.push({ level: 'error', message: `${at}: relation must include "delegate_permission/common.handle_all_urls" for App Links.` });
    }
    const t = s.target ?? {};
    if (t['namespace'] !== 'android_app') issues.push({ level: 'error', message: `${at}: target.namespace must be "android_app".` });
    if (!PACKAGE.test(String(t['package_name'] ?? ''))) issues.push({ level: 'error', message: `${at}: package_name “${t['package_name'] ?? ''}” is not a valid Android package name.` });
    const prints = t['sha256_cert_fingerprints'];
    if (!Array.isArray(prints) || !prints.length) issues.push({ level: 'error', message: `${at}: sha256_cert_fingerprints is missing or empty.` });
    else for (const f of prints) if (!FINGERPRINT.test(String(f))) issues.push({ level: 'error', message: `${at}: “${f}” is not a SHA-256 fingerprint (32 pairs like AB:CD:…, uppercase).` });
  });
  if (!data.length) issues.push({ level: 'error', message: 'The array is empty.' });
  return issues;
}

export function appleAssociation(teamId: string, bundleId: string, paths: string[], excluded: string[] = [], webCredentials = false): string {
  const appId = `${teamId.trim().toUpperCase()}.${bundleId.trim()}`;
  const components = [...excluded.filter(Boolean).map((p) => ({ '/': p.trim(), exclude: true })), ...(paths.filter(Boolean).length ? paths.filter(Boolean) : ['*']).map((p) => ({ '/': p.trim() }))];
  const doc: Record<string, unknown> = { applinks: { details: [{ appIDs: [appId], components }] } };
  if (webCredentials) doc['webcredentials'] = { apps: [appId] };
  return JSON.stringify(doc, null, 2) + '\n';
}

export function checkAppleAssociation(text: string): Issue[] {
  let data: { applinks?: { details?: { appIDs?: unknown; appID?: unknown; components?: unknown; paths?: unknown }[]; apps?: unknown } };
  try {
    data = JSON.parse(text);
  } catch (error) {
    return [{ level: 'error', message: `Not valid JSON: ${(error as Error).message}` }];
  }
  const issues: Issue[] = [];
  const details = data.applinks?.details;
  if (!Array.isArray(details) || !details.length) return [{ level: 'error', message: 'applinks.details is missing or empty.' }];
  if (data.applinks?.apps !== undefined && !(Array.isArray(data.applinks.apps) && !data.applinks.apps.length)) {
    issues.push({ level: 'warning', message: 'applinks.apps is an old key; it should be an empty array or left out.' });
  }
  details.forEach((d, i) => {
    const ids = Array.isArray(d.appIDs) ? d.appIDs : d.appID ? [d.appID] : [];
    if (!ids.length) issues.push({ level: 'error', message: `Detail ${i + 1}: appIDs is missing.` });
    if (d.appID) issues.push({ level: 'warning', message: `Detail ${i + 1}: appID (single) is the iOS 12 format; use appIDs with components for iOS 13 and later.` });
    for (const id of ids) {
      const [team, ...bundle] = String(id).split('.');
      if (!TEAM_ID.test(team) || !bundle.length) issues.push({ level: 'error', message: `Detail ${i + 1}: “${id}” must be TEAMID.bundle.id with a 10-character team ID.` });
    }
    if (!d.components && !d.paths) issues.push({ level: 'error', message: `Detail ${i + 1}: components (or the older paths) is missing, so no links open the app.` });
  });
  return issues;
}

export function intentFilter(scheme: string, host: string, pathPrefixes: string[]): string {
  const data = (pathPrefixes.filter(Boolean).length ? pathPrefixes.filter(Boolean) : ['']).map((p) =>
    `        <data android:scheme="${scheme}" android:host="${host.trim()}"${p ? ` android:pathPrefix="${p.trim()}"` : ''} />`,
  );
  return (
    '<intent-filter android:autoVerify="true">\n' +
    '        <action android:name="android.intent.action.VIEW" />\n' +
    '        <category android:name="android.intent.category.DEFAULT" />\n' +
    '        <category android:name="android.intent.category.BROWSABLE" />\n' +
    `${data.join('\n')}\n` +
    '</intent-filter>\n'
  );
}

export interface TestCommands {
  android: string;
  androidVerify: string;
  ios: string;
  assetLinksUrl: string;
  appleUrl: string;
}

export function testCommands(link: string, packageName: string): TestCommands | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
  return {
    android: `adb shell am start -W -a android.intent.action.VIEW -d ${q(url.href)}${packageName ? ` ${packageName}` : ''}`,
    androidVerify: `adb shell pm get-app-links ${packageName || '<package.name>'}`,
    ios: `xcrun simctl openurl booted ${q(url.href)}`,
    assetLinksUrl: `${url.protocol}//${url.host}/.well-known/assetlinks.json`,
    appleUrl: `${url.protocol}//${url.host}/.well-known/apple-app-site-association`,
  };
}
