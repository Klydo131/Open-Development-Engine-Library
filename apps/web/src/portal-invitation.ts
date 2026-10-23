export function takePortalInvitation(input: string): {url: string; token?: string} {
  const url = new URL(input), fragment = new URLSearchParams(url.hash.slice(1));
  const token = fragment.get('invite');
  if (fragment.has('invite')) {
    fragment.delete('invite'); url.hash = fragment.toString();
  }
  return {url: url.href, ...(token && /^[a-f0-9]{64}$/u.test(token) ? {token} : {})};
}
