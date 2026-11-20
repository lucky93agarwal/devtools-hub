import { expect, test, type Page } from '@playwright/test';

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

  page.once('dialog', (d) => d.accept());
  await details.getByRole('button', { name: 'Block user' }).click();
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
  }
  await context.close();
});
