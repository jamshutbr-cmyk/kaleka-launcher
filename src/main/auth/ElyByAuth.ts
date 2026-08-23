import https from 'https';

export interface ElyByAccount {
  accessToken: string;
  clientToken: string;
  uuid: string;
  username: string;
}

export interface AuthResponse {
  accessToken: string;
  clientToken: string;
  availableProfiles: Array<{ id: string; name: string }>;
  selectedProfile: { id: string; name: string };
  user?: {
    id: string;
    username: string;
    properties: Array<{ name: string; value: string }>;
  };
}

/**
 * Авторизация пользователя через Ely.by
 */
export async function authenticate(
  username: string,
  password: string,
  clientToken: string
): Promise<ElyByAccount> {
  const payload = JSON.stringify({
    username,
    password,
    clientToken,
    requestUser: true,
  });

  const response = await makeRequest('POST', '/auth/authenticate', payload);
  const data: AuthResponse = JSON.parse(response);

  return {
    accessToken: data.accessToken,
    clientToken: data.clientToken,
    uuid: data.selectedProfile.id,
    username: data.selectedProfile.name,
  };
}

/**
 * Обновление токена
 */
export async function refresh(
  accessToken: string,
  clientToken: string
): Promise<ElyByAccount> {
  const payload = JSON.stringify({
    accessToken,
    clientToken,
    requestUser: true,
  });

  const response = await makeRequest('POST', '/auth/refresh', payload);
  const data: AuthResponse = JSON.parse(response);

  return {
    accessToken: data.accessToken,
    clientToken: data.clientToken,
    uuid: data.selectedProfile.id,
    username: data.selectedProfile.name,
  };
}

/**
 * Проверка валидности токена
 */
export async function validate(accessToken: string): Promise<boolean> {
  try {
    const payload = JSON.stringify({ accessToken });
    await makeRequest('POST', '/auth/validate', payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Инвалидация токена (logout)
 */
export async function invalidate(accessToken: string, clientToken: string): Promise<void> {
  const payload = JSON.stringify({ accessToken, clientToken });
  await makeRequest('POST', '/auth/invalidate', payload);
}

/**
 * Получение информации о пользователе по UUID
 */
export async function getUserProfile(uuid: string): Promise<{ id: string; name: string }> {
  const response = await makeRequest('GET', `/api/users/profiles/minecraft/${uuid}`, '');
  return JSON.parse(response);
}

/**
 * Внутренний метод для HTTP запросов
 */
function makeRequest(method: string, endpoint: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'authserver.ely.by',
      port: 443,
      path: endpoint,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve(data);
        } else {
          // Парсим ошибку от Ely.by
          let errorMessage = `HTTP ${res.statusCode}`;
          try {
            const errorData = JSON.parse(data);
            if (errorData.errorMessage) {
              errorMessage = errorData.errorMessage;
            } else if (errorData.error) {
              errorMessage = errorData.error;
            }
          } catch {
            // Если не удалось распарсить, используем статус код
          }
          
          reject(new Error(errorMessage));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}
