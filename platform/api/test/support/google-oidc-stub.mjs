/**
 * STUBBED GOOGLE — NOT A REAL GOOGLE LOGIN.
 *
 * A minimal local OpenID Connect provider that stands in for Google in
 * development and automated tests only. The API talks to it through exactly
 * the same google-auth-library code path it uses for Google — only the
 * endpoint URLs and the expected issuer differ (GOOGLE_OIDC_STUB_URL, which
 * the API ignores in production and for any non-loopback origin).
 *
 * What it enforces, like Google does:
 *  - client_id and an exactly registered redirect_uri, before anything else;
 *  - response_type=code, scope with openid, state, nonce, PKCE S256 challenge;
 *  - single-use authorization codes that expire after 5 minutes;
 *  - client_secret, redirect_uri and a code_verifier matching the challenge at /token;
 *  - RS256-signed ID tokens with iss, aud, azp, sub, email, email_verified, nonce, iat, exp.
 *
 * Usage
 *   in-process (e2e):  const stub = await startGoogleOidcStub({ clientId, clientSecret, redirectUris })
 *   standalone:        STUB_PORT=4482 STUB_CLIENT_ID=… STUB_CLIENT_SECRET=… \
 *                      STUB_REDIRECT_URIS=http://localhost:3402/proxy-api/auth/google/callback \
 *                      node test/support/google-oidc-stub.mjs
 */
import { createServer } from 'node:http';
import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { URL, URLSearchParams, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';

const b64url = (input) => Buffer.from(input).toString('base64url');
const sha256url = (value) => createHash('sha256').update(value).digest('base64url');
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function signJwt(header, payload, privateKey) {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).end().sign(privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

const AUTH_PARAMS = ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'nonce', 'code_challenge', 'code_challenge_method', 'prompt'];

function page(title, body, status = 200) {
  return {
    status,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Stubbed Google (not real Google)</title>
<style>
 body{font-family:system-ui,Arial,sans-serif;background:#f1f3f4;margin:0;padding:24px;color:#1f1f1f}
 main{max-width:460px;margin:24px auto;background:#fff;border:1px solid #dadce0;border-radius:12px;padding:28px}
 .banner{background:#fff4e5;border:2px solid #b06000;color:#5f3700;border-radius:8px;padding:12px 14px;font-weight:700;margin-bottom:18px}
 label{display:block;font-size:14px;margin:12px 0 4px} input[type=text],input[type=email]{width:100%;box-sizing:border-box;padding:10px;border:1px solid #747775;border-radius:6px;font-size:15px}
 .row{display:flex;gap:12px;margin-top:22px} button{flex:1;padding:11px;border-radius:20px;font-size:15px;cursor:pointer}
 .allow{background:#0b57d0;color:#fff;border:0} .deny{background:#fff;color:#0b57d0;border:1px solid #747775}
 .muted{color:#444746;font-size:13px}
</style></head><body><main>
<div class="banner" role="note" data-testid="stub-banner">Stubbed Google — not a real Google login. Local development/test provider only.</div>
${body}
</main></body></html>`,
  };
}

export async function startGoogleOidcStub(options = {}) {
  const {
    port = 0,
    host = '127.0.0.1',
    clientId = 'stub-client.apps.googleusercontent.test',
    clientSecret = 'stub-client-secret-not-real',
    redirectUris = [],
  } = options;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = `stub-${randomBytes(6).toString('hex')}`;
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const codes = new Map();
  const control = {
    /** Claims (or `{ foreignKey: true }`) applied to the next ID token only — for negative tests. */
    nextIdToken: null,
    /** Recorded /token requests without secrets, for assertions. */
    tokenRequests: [],
  };
  let issuer = '';

  const validateClient = (params) => {
    if (params.get('client_id') !== clientId) return 'invalid_client: unknown client_id';
    if (!redirectUris.includes(params.get('redirect_uri') ?? '')) return 'redirect_uri_mismatch: the redirect URI is not registered for this client';
    return null;
  };

  const validateRequest = (params) => {
    if (params.get('response_type') !== 'code') return 'unsupported_response_type';
    if (!(params.get('scope') ?? '').split(' ').includes('openid')) return 'invalid_scope: openid is required';
    if (!params.get('state')) return 'invalid_request: state is required';
    if (!params.get('nonce')) return 'invalid_request: nonce is required';
    if (params.get('code_challenge_method') !== 'S256' || !/^[\w-]{43}$/.test(params.get('code_challenge') ?? '')) {
      return 'invalid_request: a PKCE S256 code_challenge is required';
    }
    return null;
  };

  const consentPage = (params) => {
    const hidden = AUTH_PARAMS.filter((k) => params.has(k))
      .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(params.get(k))}">`)
      .join('');
    return page(
      'Choose an account',
      `<h1 style="font-size:22px;margin:0 0 6px">Choose a stub account</h1>
<p class="muted">Continuing sends a signed test ID token to <strong>${escapeHtml(new URL(params.get('redirect_uri')).origin)}</strong>. No Google account is involved.</p>
<form method="post" action="/o/oauth2/v2/auth/decision">${hidden}
<label for="email">Email</label><input id="email" name="email" type="email" required value="${escapeHtml(params.get('login_hint') ?? '')}">
<label for="given_name">First name</label><input id="given_name" name="given_name" type="text" value="Stub">
<label for="family_name">Last name</label><input id="family_name" name="family_name" type="text" value="Traveler">
<label style="display:flex;gap:8px;align-items:center"><input id="email_verified" name="email_verified" type="checkbox" value="true" checked> The provider reports this email as verified</label>
<div class="row"><button class="deny" type="submit" name="decision" value="deny">Cancel</button><button class="allow" type="submit" name="decision" value="allow">Continue</button></div>
</form>`,
    );
  };

  const idTokenFor = (entry) => {
    const now = Math.floor(Date.now() / 1000);
    const override = control.nextIdToken;
    control.nextIdToken = null;
    const payload = {
      iss: issuer,
      azp: clientId,
      aud: clientId,
      sub: entry.profile.sub,
      email: entry.profile.email,
      email_verified: entry.profile.emailVerified,
      name: [entry.profile.givenName, entry.profile.familyName].filter(Boolean).join(' '),
      given_name: entry.profile.givenName || undefined,
      family_name: entry.profile.familyName || undefined,
      nonce: entry.nonce,
      iat: now,
      exp: now + 3600,
      ...(override && !override.foreignKey ? override : {}),
    };
    const key = override?.foreignKey ? generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey : privateKey;
    return signJwt({ alg: 'RS256', kid, typ: 'JWT' }, payload, key);
  };

  const send = (res, status, body, headers = {}) => {
    const isJson = typeof body !== 'string';
    res.writeHead(status, {
      'Content-Type': isJson ? 'application/json' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end(isJson ? JSON.stringify(body) : body);
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, issuer);
      if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
        return send(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/o/oauth2/v2/auth`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/oauth2/v3/certs`,
          response_types_supported: ['code'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
        });
      }
      if (req.method === 'GET' && url.pathname === '/oauth2/v1/certs') {
        return send(res, 200, { [kid]: publicPem }, { 'Cache-Control': 'public, max-age=300' });
      }
      if (req.method === 'GET' && url.pathname === '/oauth2/v3/certs') {
        return send(res, 200, { keys: [jwk] }, { 'Cache-Control': 'public, max-age=300' });
      }
      if (req.method === 'GET' && url.pathname === '/o/oauth2/v2/auth') {
        // Like Google: a bad client or redirect URI is shown here, never redirected.
        const clientProblem = validateClient(url.searchParams);
        if (clientProblem) {
          const p = page('Error 400', `<h1>Error 400</h1><p>${escapeHtml(clientProblem)}</p>`, 400);
          return send(res, p.status, p.html);
        }
        const problem = validateRequest(url.searchParams);
        if (problem) {
          const back = new URL(url.searchParams.get('redirect_uri'));
          back.searchParams.set('error', problem.split(':')[0]);
          if (url.searchParams.get('state')) back.searchParams.set('state', url.searchParams.get('state'));
          return send(res, 302, '', { Location: back.toString() });
        }
        const p = consentPage(url.searchParams);
        return send(res, p.status, p.html);
      }
      if (req.method === 'POST' && url.pathname === '/o/oauth2/v2/auth/decision') {
        const form = new URLSearchParams(await readBody(req));
        const problem = validateClient(form) ?? validateRequest(form);
        if (problem) {
          const p = page('Error 400', `<h1>Error 400</h1><p>${escapeHtml(problem)}</p>`, 400);
          return send(res, p.status, p.html);
        }
        const back = new URL(form.get('redirect_uri'));
        back.searchParams.set('state', form.get('state'));
        if (form.get('decision') !== 'allow') {
          back.searchParams.set('error', 'access_denied');
          return send(res, 302, '', { Location: back.toString() });
        }
        const email = (form.get('email') ?? '').trim().toLowerCase();
        if (!email) {
          const p = page('Email required', '<p>Enter an email address for the stub account.</p>', 400);
          return send(res, p.status, p.html);
        }
        const code = `stubcode_${randomBytes(24).toString('base64url')}`;
        codes.set(code, {
          redirectUri: form.get('redirect_uri'),
          challenge: form.get('code_challenge'),
          nonce: form.get('nonce'),
          expiresAt: Date.now() + 5 * 60_000,
          used: false,
          profile: {
            sub: form.get('sub') || `stub-${createHash('sha256').update(email).digest('hex').slice(0, 20)}`,
            email,
            emailVerified: form.get('email_verified') === 'true',
            givenName: (form.get('given_name') ?? '').trim(),
            familyName: (form.get('family_name') ?? '').trim(),
          },
        });
        back.searchParams.set('code', code);
        back.searchParams.set('scope', 'openid email profile');
        return send(res, 302, '', { Location: back.toString() });
      }
      if (req.method === 'POST' && url.pathname === '/token') {
        const form = new URLSearchParams(await readBody(req));
        const entry = codes.get(form.get('code') ?? '');
        const verifier = form.get('code_verifier') ?? '';
        control.tokenRequests.push({
          grantType: form.get('grant_type'),
          clientId: form.get('client_id'),
          clientSecretSent: form.has('client_secret'),
          redirectUri: form.get('redirect_uri'),
          verifierMatchesChallenge: !!entry && sha256url(verifier) === entry.challenge,
        });
        const fail = (error, description) => send(res, 400, { error, error_description: description });
        if (form.get('grant_type') !== 'authorization_code') return fail('unsupported_grant_type', 'authorization_code only');
        if (form.get('client_id') !== clientId || form.get('client_secret') !== clientSecret) return fail('invalid_client', 'client authentication failed');
        if (!entry) return fail('invalid_grant', 'unknown authorization code');
        if (entry.used) return fail('invalid_grant', 'authorization code already used');
        entry.used = true;
        if (entry.expiresAt < Date.now()) return fail('invalid_grant', 'authorization code expired');
        if (form.get('redirect_uri') !== entry.redirectUri) return fail('invalid_grant', 'redirect_uri does not match the authorization request');
        if (sha256url(verifier) !== entry.challenge) return fail('invalid_grant', 'PKCE code_verifier does not match the code_challenge');
        return send(res, 200, {
          access_token: `stub-access-${randomBytes(16).toString('base64url')}`,
          expires_in: 3599,
          scope: 'openid email profile',
          token_type: 'Bearer',
          id_token: idTokenFor(entry),
        });
      }
      return send(res, 404, { error: 'not_found' });
    } catch (err) {
      return send(res, 500, { error: 'server_error', error_description: String(err?.message ?? err) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  issuer = `http://${host}:${server.address().port}`;

  return {
    issuer,
    clientId,
    control,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// Standalone mode for local browser checks.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stub = await startGoogleOidcStub({
    port: Number(process.env.STUB_PORT ?? 4482),
    clientId: process.env.STUB_CLIENT_ID,
    clientSecret: process.env.STUB_CLIENT_SECRET,
    redirectUris: (process.env.STUB_REDIRECT_URIS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  });
  process.stdout.write(`Stubbed Google (NOT real Google) OIDC provider listening at ${stub.issuer}\n`);
  const stop = () => stub.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
