# Интеграция Ely.by в Kaleka Launcher

## Что было добавлено

### Backend (Electron Main Process)

1. **ElyByAuth.ts** (`src/main/auth/ElyByAuth.ts`)
   - Модуль для авторизации через Ely.by API
   - Методы: `authenticate`, `refresh`, `validate`, `invalidate`
   - Работает с authserver.ely.by

2. **main.ts** - IPC обработчики:
   - `auth:login` - вход в аккаунт
   - `auth:refresh` - обновление токена
   - `auth:validate` - проверка токена
   - `auth:logout` - выход из аккаунта

3. **preload.ts** - API для рендерера:
   - `elyLogin(username, password)`
   - `elyRefresh(accessToken, clientToken)`
   - `elyValidate(accessToken)`
   - `elyLogout(accessToken, clientToken)`

4. **MinecraftLauncher.ts**:
   - Добавлены параметры `uuid` и `accessToken` в `LaunchOptions`
   - Игра запускается с токенами Ely.by если пользователь авторизован
   - Поддержка как оффлайн режима, так и лицензионного

### Frontend (React)

1. **App.tsx**:
   - Управление состоянием Ely.by аккаунта
   - Сохранение/загрузка данных из localStorage
   - Передача `elyAccount` в дочерние компоненты

2. **Header.tsx**:
   - Показывает "✓ Ely.by" если авторизован
   - Показывает "Оффлайн" если не авторизован
   - Скрывает поле ввода ника когда пользователь залогинен через Ely.by

3. **SettingsView.tsx**:
   - Новая секция "Аккаунт Ely.by"
   - Форма входа (email/пароль)
   - Показ текущего авторизованного аккаунта
   - Кнопка "Выйти" для разлогина
   - Обработка ошибок авторизации

4. **HomeView.tsx**:
   - При запуске игры передает `uuid` и `accessToken` если есть
   - Работает в оффлайн режиме если аккаунт Ely.by не подключен

5. **SettingsView.css**:
   - Стили для секции Ely.by
   - Зеленая подсветка для авторизованного аккаунта
   - Синяя кнопка входа
   - Красная кнопка выхода

## Как это работает

### Оффлайн режим (по умолчанию)
1. Пользователь вводит ник в поле на главной странице
2. Игра запускается с параметром `--userType offline`
3. UUID = `00000000-0000-0000-0000-000000000000`
4. accessToken = `null`

### Режим Ely.by (опционально)
1. Пользователь идет в Настройки
2. В секции "Аккаунт Ely.by" нажимает "Войти через Ely.by"
3. Вводит email/пароль от Ely.by
4. После успешного входа:
   - Данные сохраняются в localStorage
   - Ник меняется на ник из Ely.by
   - В хедере показывается "✓ Ely.by"
5. При запуске игры:
   - Передается настоящий UUID из Ely.by
   - Передается accessToken
   - Игра запускается с параметром `--userType mojang`
   - Можно играть на лицензионных серверах

### Выход из аккаунта
1. В настройках нажать "Выйти"
2. Токены удаляются из localStorage
3. Возврат к оффлайн режиму

## Структура данных

### ElyAccount
```typescript
interface ElyAccount {
  accessToken: string;  // Токен для игры
  clientToken: string;  // Токен клиента
  uuid: string;         // UUID игрока
  username: string;     // Ник игрока
}
```

### LocalStorage
- `elyAccount` - JSON с данными аккаунта
- `username` - текущий ник (синхронизируется с Ely.by)

## API Ely.by

Используется официальный API:
- **Хост**: `authserver.ely.by`
- **Порт**: 443 (HTTPS)
- **Эндпоинты**:
  - `/auth/authenticate` - вход
  - `/auth/refresh` - обновление токена
  - `/auth/validate` - проверка токена
  - `/auth/invalidate` - выход

## Для запуска

```bash
# Разработка
npm run dev

# Сборка
npm run build
npm run build:win
```

## Примечания

- Авторизация полностью опциональна
- По умолчанию работает оффлайн режим
- Токены автоматически сохраняются
- При следующем запуске лаунчера пользователь остается залогиненным
- Можно переключаться между оффлайн и Ely.by режимами
