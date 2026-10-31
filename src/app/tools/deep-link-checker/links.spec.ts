import { appleAssociation, assetLinks, checkAppleAssociation, checkAssetLinks, intentFilter, normalizeFingerprint, testCommands } from './links';

const FP = '14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5';

describe('links', () => {
  it('makes a valid assetlinks.json and accepts fingerprints in any form', () => {
    expect(normalizeFingerprint(FP.replace(/:/g, '').toLowerCase())).toBe(FP);
    const json = assetLinks('com.acme.shop', [FP], true);
    expect(JSON.parse(json)[0].relation).toEqual(['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds']);
    expect(checkAssetLinks(json)).toEqual([]);
  });

  it('finds mistakes in assetlinks.json', () => {
    const bad = JSON.stringify({ relation: [] });
    expect(checkAssetLinks(bad)[0].message).toContain('JSON array');
    const issues = checkAssetLinks(JSON.stringify([{ relation: ['x'], target: { namespace: 'web', package_name: 'shop', sha256_cert_fingerprints: ['AB:CD'] } }]));
    expect(issues.map((i) => i.level)).toEqual(['error', 'error', 'error', 'error']);
  });

  it('makes and checks apple-app-site-association', () => {
    const json = appleAssociation('ab12cd34ef', 'com.acme.shop', ['/orders/*'], ['/admin/*'], true);
    const doc = JSON.parse(json);
    expect(doc.applinks.details[0]).toEqual({ appIDs: ['AB12CD34EF.com.acme.shop'], components: [{ '/': '/admin/*', exclude: true }, { '/': '/orders/*' }] });
    expect(doc.webcredentials.apps).toEqual(['AB12CD34EF.com.acme.shop']);
    expect(checkAppleAssociation(json)).toEqual([]);
    expect(checkAppleAssociation('{"applinks":{"details":[{"appID":"X.com.a"}]}}').map((i) => i.message)).toEqual([
      'Detail 1: appID (single) is the iOS 12 format; use appIDs with components for iOS 13 and later.',
      'Detail 1: “X.com.a” must be TEAMID.bundle.id with a 10-character team ID.',
      'Detail 1: components (or the older paths) is missing, so no links open the app.',
    ]);
  });

  it('writes the intent filter and test commands', () => {
    expect(intentFilter('https', 'shop.example.com', ['/orders'])).toContain('<data android:scheme="https" android:host="shop.example.com" android:pathPrefix="/orders" />');
    const c = testCommands('https://shop.example.com/orders/42', 'com.acme.shop');
    expect(c?.android).toBe('adb shell am start -W -a android.intent.action.VIEW -d "https://shop.example.com/orders/42" com.acme.shop');
    expect(c?.assetLinksUrl).toBe('https://shop.example.com/.well-known/assetlinks.json');
    expect(testCommands('not a url', '')).toBeNull();
  });
});
