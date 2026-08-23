import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { shell } from 'electron';

const CLIENT_ID = 'kalekalauncher2';
const CLIENT_SECRET = '3xPhmt7aan_06E0P-9Pag07NzJHp2d1XR-C1MoTmRTsi8jYsv3KNdbpJPoHWphFh';
const REDIRECT_URI = 'http://localhost:25565/callback';

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface ElyByProfile {
  id: number;
  uuid: string;
  username: string;
}

export async function startOAuthFlow(): Promise<{
  accessToken: string;
  clientToken: string;
  uuid: string;
  username: string;
}> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    let resolved = false;

    server.on('request', async (req, res) => {
      if (!req.url?.startsWith('/callback')) {
        res.writeHead(404);
        res.end();
        return;
      }

      const url = new URL(req.url, 'http://localhost:25565');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      const closeWithHtml = (html: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;padding:40px;text-align:center;background:#111;color:#fff">${html}</body></html>`);
        server.close();
      };

      if (error) {
        closeWithHtml(`<h2>Ошибка авторизации</h2><p>${error}</p><p>Можно закрыть это окно</p>`);
        if (!resolved) { resolved = true; reject(new Error(`OAuth error: ${error}`)); }
        return;
      }

      if (!code) {
        closeWithHtml(`<h2>Ошибка</h2><p>Код авторизации не получен</p>`);
        if (!resolved) { resolved = true; reject(new Error('Missing authorization code')); }
        return;
      }

      try {
        const tokenData = await exchangeCodeForToken(code);
        const profile = await getUserInfo(tokenData.access_token);

        closeWithHtml(`<h2 style="color:#4caf50">Успешно!</h2><p>Вы вошли как <strong>${profile.username}</strong></p><p style="color:#aaa">Можно закрыть это окно</p>`);

        if (!resolved) {
          resolved = true;
          resolve({
            accessToken: tokenData.access_token,
            clientToken: tokenData.refresh_token || tokenData.access_token,
            uuid: profile.uuid,
            username: profile.username,
          });
        }
      } catch (err: any) {
        closeWithHtml(`<h2>Ошибка</h2><p>${err.message}</p><p>Можно закрыть это окно</p>`);
        if (!resolved) { resolved = true; reject(err); }
      }
    });

    server.listen(25565, () => {
      const authUrl = 'https://account.ely.by/oauth2/v1?' + new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'account_info minecraft_server_session offline_access',
      }).toString();

      shell.openExternal(authUrl);
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.close();
        reject(new Error('timeout'));
      }
    }, 5 * 60 * 1000);

    server.on('error', (err) => {
      if (!resolved) { resolved = true; reject(err); }
    });
  });
}

async function exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    code,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'account.ely.by',
      port: 443,
      path: '/api/oauth2/v1/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Failed to parse token response')); }
        } else {
          try {
            const err = JSON.parse(data);
            reject(new Error(err.error_description || err.error || `HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`Token exchange failed: ${res.statusCode}`));
          }
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getUserInfo(accessToken: string): Promise<ElyByProfile> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'account.ely.by',
      port: 443,
      path: '/api/account/v1/info',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const info = JSON.parse(data);
            resolve({
              id: info.id,
              uuid: info.uuid,
              username: info.username,
            });
          } catch { reject(new Error('Failed to parse user info')); }
        } else {
          reject(new Error(`Profile fetch failed: ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
