import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Sign up, confirm email, log out / in, wrong passwords, forgot and reset password, and the
// admin panel, against the real Worker API and a fresh local database.

const ADMIN = { first: 'Asha', last: 'Admin', email: 'admin@devtools24.test', mobile: '9876543210', password: 'Admin-test-2026' };
const USER = { first: 'Ravi', last: 'Kumar', email: 'ravi.kumar@example.test', mobile: '9123456780', password: 'Ravi-test-2026' };

/** Waits until Cloudflare's test CAPTCHA has passed (it fills a hidden field), when the CAPTCHA is on. */
async function captcha(page: Page): Promise<void> {
  if (!(await page.locator('app-turnstile div').count())) return;
  await expect.poll(() => page.locator('input[name="cf-turnstile-response"]').inputValue().catch(() => ''), { timeout: 20_000 }).not.toBe('');
}

async function signUp(page: Page, who: typeof ADMIN): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('First name').fill(who.first);
  await page.getByLabel('Last name').fill(who.last);
  await page.getByLabel('Email').fill(who.email);
  await page.getByRole('textbox', { name: 'Mobile number' }).fill(who.mobile);
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('checkbox').check();
  await captcha(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account\?welcome=1$/);
}

async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await captcha(page);
  await page.getByRole('button', { name: 'Log in' }).click();
  // Wait for the answer: the account page, or a message.
  await Promise.race([page.waitForURL(/\/account/), page.getByRole('alert').waitFor()]);
}

test('sign up checks every field and creates the account', async ({ page }) => {
  await page.goto('/signup');
  await captcha(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('Please check the highlighted fields');
  await expect(page.getByText('Enter your first name.')).toBeVisible();
  await expect(page.getByText('Enter your email address.')).toBeVisible();
  await expect(page.getByText('Please accept the Terms')).toBeVisible();
  await page.getByRole('textbox', { name: 'Mobile number' }).fill('12345');
  await page.getByRole('textbox', { name: 'Mobile number' }).blur();
  await expect(page.getByText('10-digit Indian mobile number')).toBeVisible();

  await signUp(page, ADMIN);
  await expect(page.getByText(`Welcome, ${ADMIN.first}!`)).toBeVisible();
  await expect(page.getByText('+919876543210')).toBeVisible();
  await expect(page.getByText('Not confirmed')).toBeVisible();
  // The header shows the initials instead of "Log in".
  await expect(page.getByRole('link', { name: `My account (${ADMIN.email})` })).toHaveText('AA');

  // The same email cannot sign up twice.
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto('/signup');
  await page.getByLabel('First name').fill('Other');
  await page.getByLabel('Last name').fill('Person');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByRole('textbox', { name: 'Mobile number' }).fill('9000000000');
  await page.getByLabel('Password', { exact: true }).fill('Another-pass-9');
  await page.getByRole('checkbox').check();
  await captcha(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('An account with this email already exists. Log in, or reset your password.')).toBeVisible();
});

test('email confirmation from the admin outbox, and wrong passwords', async ({ page }) => {
  await logIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/account$/);
  // No email service locally: the admin panel lists the emails with their links.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Emails' }).click();
  const email = page.getByRole('list', { name: 'Emails' }).getByRole('listitem').filter({ hasText: 'Confirm your email' }).first();
  await expect(email).toContainText(`To ${ADMIN.email}`);
  await email.getByRole('link', { name: 'Open the link' }).click();
  await expect(page.getByText('Your email is confirmed. Thank you!')).toBeVisible();
  await page.goto('/account');
  await expect(page.getByText('✓ Confirmed')).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();

  for (let i = 0; i < 3; i++) {
    await logIn(page, ADMIN.email, 'Wrong-password-1');
    await expect(page.getByRole('alert')).toContainText('Email or password is wrong');
  }
  await expect(page.getByRole('alert')).toContainText('2 more tries');
});

test('forgot password sends a link that resets the password once', async ({ page }) => {
  await signUp(page, USER);
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(USER.email);
  await captcha(page);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  // An unknown email gets the same answer.
  await page.getByRole('button', { name: 'Use another email' }).click();
  await page.getByLabel('Email').fill('nobody@example.test');
  await captcha(page);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();

  await logIn(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Emails' }).click();
  const reset = page.getByRole('list', { name: 'Emails' }).getByRole('listitem').filter({ hasText: 'Reset your DevTools24 password' }).first();
  await expect(reset).toContainText(`To ${USER.email}`);
  const link = await reset.getByRole('link', { name: 'Open the link' }).getAttribute('href');
  await page.getByRole('button', { name: 'Log out' }).count();
  await page.request.post('/api/auth/logout', { headers: { 'content-type': 'application/json' }, data: {} });

  await page.goto(link!);
  await page.getByLabel('New password', { exact: true }).fill('New-ravi-2026');
  await page.getByLabel('Repeat the new password').fill('Different-1');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert')).toContainText('not the same');
  await page.getByLabel('Repeat the new password').fill('New-ravi-2026');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Your password was changed.')).toBeVisible();

  // The link works only once.
  await page.goto(link!);
  await page.getByLabel('New password', { exact: true }).fill('Again-ravi-2026');
  await page.getByLabel('Repeat the new password').fill('Again-ravi-2026');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert')).toContainText('already used');

  await logIn(page, USER.email, USER.password);
  await expect(page.getByRole('alert')).toContainText('Email or password is wrong');
  await logIn(page, USER.email, 'New-ravi-2026');
  await expect(page).toHaveURL(/\/account$/);
  // A normal user cannot open the admin panel.
  await page.goto('/admin');
  await expect(page.getByText('Only admins can open this page.')).toBeVisible();
});

test('admin panel: numbers, search, user details, block and unblock', async ({ page }) => {
  await logIn(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin');
  await expect(page.getByLabel('Total users 2')).toBeVisible();
  await page.getByRole('tab', { name: 'Users' }).click();
  const table = page.getByRole('table', { name: 'Users' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await page.getByPlaceholder('Name, email or mobile').fill('ravi');
  await expect(table.getByRole('row')).toHaveCount(2);
  await table.getByRole('row', { name: `User ${USER.email}` }).click();
  const details = page.getByRole('region', { name: 'User details' });
  await expect(details).toContainText('Ravi Kumar');
  await expect(details).toContainText('+919123456780');

  await details.getByRole('button', { name: 'Block user' }).click();
  await page.getByRole('alertdialog', { name: 'Block this user?' }).getByRole('button', { name: 'Block user' }).click();
  await expect(details).toContainText('Blocked since');
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('list', { name: 'Admin activity' })).toContainText('block user');

  // A blocked user cannot log in.
  await page.request.post('/api/auth/logout', { headers: { 'content-type': 'application/json' }, data: {} });
  await logIn(page, USER.email, 'New-ravi-2026');
  await expect(page.getByRole('alert')).toContainText('This account is blocked');

  await logIn(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Users' }).click();
  await page.getByRole('table', { name: 'Users' }).getByRole('row', { name: `User ${USER.email}` }).click();
  await page.getByRole('region', { name: 'User details' }).getByRole('button', { name: 'Unblock' }).click();
  await expect(page.getByRole('region', { name: 'User details' })).toContainText('Active');
});

test('tools still work without logging in, and other sites cannot call the API', async ({ page, request }) => {
  await page.goto('/json-formatter');
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  const response = await request.post('/api/auth/login', { headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, data: {} });
  expect(response.status()).toBe(403);
  expect((await request.get('/api/admin/users')).status()).toBe(401);
});

test('forms are never sent before the page is ready, and never with the password in the address', async ({ browser }) => {
  // Without scripts the page is exactly what the server sends: buttons must be off, forms POST only.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [path, button] of [
    ['/signup', 'Create account'],
    ['/login', 'Log in'],
    ['/forgot-password', 'Send reset link'],
  ]) {
    await page.goto(path);
    await expect(page.locator('form').first()).toHaveAttribute('method', 'post');
    await expect(page.getByRole('button', { name: button })).toBeDisabled();
    await expect(page.locator('form input').first()).toBeDisabled();
  }
  await context.close();
});

test('admin users table: serial numbers, pages, delete with a popup, and the deleted record', async ({ page }) => {
  // 12 extra users straight into the local test database, so there is more than one page.
  const now = Date.now();
  const rows = Array.from({ length: 12 }, (_, i) => `('bulk-${i}', 'Bulk', 'User${i}', 'bulk${i}@example.test', '+91900000${String(i).padStart(4, '0')}', 'x', 'user', ${now - i * 1000})`).join(',');
  execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', 'devtools24-accounts', '--local', '--persist-to', '.wrangler/e2e-state', '--command', `INSERT INTO users (id, first_name, last_name, email, mobile, password_hash, role, created_at) VALUES ${rows}`]);

  await logIn(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Users' }).click();
  const table = page.getByRole('table', { name: 'Users' });
  // 2 + 12 = 14 users, 10 a page.
  await expect(page.getByText('Showing 1–10 of 14')).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(11);
  await expect(table.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('1');
  await page.getByRole('button', { name: 'Page 2' }).click();
  await expect(page.getByText('Showing 11–14 of 14')).toBeVisible();
  await expect(table.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('11');
  await page.getByLabel('Rows per page').selectOption('20');
  await expect(page.getByText('Showing 1–14 of 14')).toBeVisible();
  // Admins cannot delete themselves.
  await expect(table.getByRole('row', { name: `User ${ADMIN.email}` })).toContainText('You');

  // Delete: a popup asks first; Cancel keeps the user.
  await table.getByRole('button', { name: `Delete ${USER.email}` }).click();
  const popup = page.getByRole('alertdialog', { name: 'Delete this user?' });
  await expect(popup).toContainText(USER.email);
  await popup.getByRole('button', { name: 'Cancel' }).click();
  await expect(popup).toHaveCount(0);
  await expect(table.getByRole('row', { name: `User ${USER.email}` })).toHaveCount(1);
  await table.getByRole('button', { name: `Delete ${USER.email}` }).click();
  await popup.getByRole('button', { name: 'Delete user' }).click();
  await expect(page.getByText(`${USER.email} was deleted.`)).toBeVisible();
  await expect(table.getByRole('row', { name: `User ${USER.email}` })).toHaveCount(0);

  // The record stays, with the date and the admin.
  await page.getByLabel('Filter users').selectOption('deleted');
  const deleted = page.getByRole('table', { name: 'Deleted users' });
  const row = deleted.getByRole('row', { name: `Deleted user ${USER.email}` });
  await expect(row).toContainText('Ravi Kumar');
  await expect(row).toContainText(ADMIN.email);
  await expect(row).toContainText('Deleted');
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('list', { name: 'Admin activity' })).toContainText(`delete user · ${USER.email}`);

  // The deleted user cannot log in, but can sign up again with the same email.
  await page.request.post('/api/auth/logout', { headers: { 'content-type': 'application/json' }, data: {} });
  await logIn(page, USER.email, 'New-ravi-2026');
  await expect(page.getByRole('alert')).toContainText('Email or password is wrong');
  await signUp(page, USER);
  await page.request.post('/api/auth/logout', { headers: { 'content-type': 'application/json' }, data: {} });
  await logIn(page, ADMIN.email, ADMIN.password);
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Users' }).click();
  await page.getByLabel('Filter users').selectOption('deleted');
  await expect(page.getByRole('table', { name: 'Deleted users' }).getByRole('row', { name: `Deleted user ${USER.email}` })).toContainText('Signed up again');
});

test('visits and logins are recorded with place, GPS and device; new-device email; log out another device', async ({ browser }) => {
  const LUCKNOW = { latitude: 26.8467, longitude: 80.9462 };
  // A visitor who allows the location.
  const visitor = await browser.newContext({ permissions: ['geolocation'], geolocation: LUCKNOW, serviceWorkers: 'block' });
  const page = await visitor.newPage();
  const visit = page.waitForResponse((r) => r.url().endsWith('/api/visit') && r.ok());
  const located = page.waitForRequest((r) => /\/api\/visit\/\d+\/location$/.test(r.url()));
  await page.goto('/');
  await visit;
  expect((await located).postDataJSON()).toMatchObject({ status: 'allowed', lat: LUCKNOW.latitude, lon: LUCKNOW.longitude });
  // The notice bar shows until OK is pressed, then stays away.
  const notice = page.getByRole('region', { name: 'Visit notice' });
  await expect(notice).toContainText('We record each visit');
  await expect(notice.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  await notice.getByRole('button', { name: 'OK' }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(notice).toHaveCount(0);

  // A visitor who blocks the location.
  const blocker = await browser.newContext({ serviceWorkers: 'block' });
  const other = await blocker.newPage();
  const denied = other.waitForRequest((r) => /\/api\/visit\/\d+\/location$/.test(r.url()));
  await other.goto('/');
  expect((await denied).postDataJSON()).toMatchObject({ status: expect.stringMatching(/denied|unavailable/) });

  // A wrong password, then the right one, from the first browser.
  await logIn(page, ADMIN.email, 'Wrong-pass-2026');
  await expect(page.getByRole('alert')).toContainText('Email or password is wrong');
  await logIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/account/);

  // The admin sees the visits: unknown visitors and the GPS.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Visitors' }).click();
  const visits = page.getByRole('table', { name: 'Visits' });
  await expect(visits).toContainText('Unknown user');
  await expect(visits).toContainText('26.84670, 80.94620');
  await expect(visits).toContainText('Not allowed');
  await expect(visits).toContainText('Computer');
  await expect(visits).toContainText('Chrome');
  await page.getByLabel('Filter visits').selectOption('users');
  await expect(visits).not.toContainText('Unknown user');
  await expect(visits).toContainText(ADMIN.email);

  // ... and every login attempt.
  await page.getByRole('tab', { name: 'Logins' }).click();
  const logins = page.getByRole('table', { name: 'Logins' });
  await expect(logins).toContainText('Wrong password');
  await expect(logins).toContainText('Logged in');
  await expect(logins.getByRole('row').nth(1)).toContainText('26.84670, 80.94620');
  await page.getByLabel('Filter logins').selectOption('failed');
  await expect(logins).not.toContainText('✓');

  // This browser had not logged in before: the admin got a new-device email.
  await page.getByRole('tab', { name: 'Emails' }).click();
  await expect(page.getByRole('list', { name: 'Emails' })).toContainText('New login to your DevTools24 account');

  // Logged in on a second browser too; the first one can log it out.
  await logIn(other, ADMIN.email, ADMIN.password);
  await expect(other).toHaveURL(/\/account/);
  await page.goto('/account');
  const activity = page.getByRole('region', { name: 'Login activity' });
  await expect(activity).toContainText('This device');
  await expect(activity).toContainText('Wrong password'.toLowerCase());
  const others = activity.getByRole('button', { name: 'Log out this device' });
  const before = await others.count();
  expect(before).toBeGreaterThan(0);
  await others.first().click();
  await expect(others).toHaveCount(before - 1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Login activity' })).toBeVisible();
  await visitor.close();
  await blocker.close();
});
