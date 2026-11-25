/** The ways to log in: Manual (email + password) and the four providers. */
export const SOCIAL_PROVIDERS = ['google', 'facebook', 'apple', 'github'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

const NAMES: Record<string, string> = { password: 'Manual', google: 'Google', facebook: 'Facebook', apple: 'Apple', github: 'GitHub' };

/** "Manual", "Google", "Facebook", "Apple" or "GitHub". */
export function methodLabel(method: string | null | undefined): string {
  return NAMES[method ?? 'password'] ?? 'Manual';
}

/** A colour per login type, for the small badges in the admin panel. */
export function methodClass(method: string | null | undefined): string {
  return (
    {
      google: '!border-[#4285F4] !text-[#4285F4]',
      facebook: '!border-[#1877F2] !text-[#1877F2]',
      apple: '!border-ink !text-ink',
      github: '!border-[#6e5494] !text-[#6e5494]',
    }[method ?? ''] ?? ''
  );
}

/** What a login record says happened: "Signed up", "Password reset", "Google", "Logged in"… */
export function eventLabel(method: string | null | undefined): string {
  if (method === 'signup') return 'Signed up';
  if (method === 'reset') return 'Password reset';
  if (method && method !== 'password') return methodLabel(method);
  return 'Logged in';
}
