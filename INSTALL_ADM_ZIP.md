# Установка adm-zip

Для работы умного импорта модов нужно установить библиотеку `adm-zip`:

```bash
npm install adm-zip
npm install --save-dev @types/adm-zip
```

Эта библиотека используется для чтения содержимого JAR-файлов модов и определения их совместимости с версией Minecraft.

После установки пересоберите проект:
```bash
npm run build
```

Или запустите в dev-режиме:
```bash
npm run dev
```
