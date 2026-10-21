export const securityHeaders = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};
/** The private application keeps connect-src none, even when a course provider is configured. */
export function portalSecurityHeaders(origin?:string){
  if(origin&&(!/^https?:\/\//.test(origin)||new URL(origin).origin!==origin))throw new Error('Expected a validated service origin.');
  return {...securityHeaders,'Cache-Control':'no-store','Content-Security-Policy':securityHeaders['Content-Security-Policy'].replace("connect-src 'none'",`connect-src 'self'${origin?` ${origin}`:''}`)};
}
