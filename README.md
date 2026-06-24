# CRM Omnicanal

CRM SaaS multiempresa para centralizar conversaciones, contactos, leads e inbox de canales Meta. La primera version no integra IA dentro del producto; la IA se usa solo como herramienta externa de desarrollo.

## Stack

- Frontend: Next.js + TypeScript
- Backend: NestJS + TypeScript
- Base de datos: PostgreSQL
- ORM: Prisma
- Colas: Redis + BullMQ
- Infra local: Docker Compose

## Primer arranque

```powershell
copy .env.example .env
copy apps\api\.env.example apps\api\.env
npm.cmd install
npm.cmd run docker:up
npm.cmd run db:generate
npm.cmd run db:migrate -w apps/api -- --name init
npm.cmd run db:seed
npm.cmd run dev
```

Credenciales demo luego del seed:

- Email: `admin@demo.com`
- Password: `admin1234`

## Puertos

- Web: `http://localhost:3000`
- API: `http://localhost:3001/api`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Webhook WhatsApp Meta

Variables en `apps/api/.env`:

- `META_WHATSAPP_VERIFY_TOKEN`: token que configuras en Meta para validar el webhook.
- `META_WHATSAPP_ORGANIZATION_ID`: organizacion destino dentro del CRM.
- `META_WHATSAPP_ACCESS_TOKEN`: token de acceso con permiso `whatsapp_business_messaging`.
- `META_WHATSAPP_PHONE_NUMBER_ID`: ID del numero emisor en WhatsApp Cloud API.
- `META_GRAPH_API_VERSION`: version de Graph API a usar para WhatsApp, por defecto `v23.0`.

Endpoints:

- `GET /api/webhooks/meta/whatsapp`
- `POST /api/webhooks/meta/whatsapp`

Si `META_WHATSAPP_ACCESS_TOKEN` o `META_WHATSAPP_PHONE_NUMBER_ID` no estan configurados, las respuestas outbound por WhatsApp se guardan en modo simulado.

## Webhook Instagram Meta

Variables en `apps/api/.env`:

- `META_INSTAGRAM_VERIFY_TOKEN`: token que configuras en Meta para validar el webhook.
- `META_INSTAGRAM_ORGANIZATION_ID`: organizacion destino dentro del CRM.
- `META_INSTAGRAM_ACCESS_TOKEN`: token de acceso generado en Meta.
- `META_INSTAGRAM_BUSINESS_ACCOUNT_ID`: ID de la cuenta profesional de Instagram.
- `META_INSTAGRAM_API_VERSION`: version de Instagram API a usar, por defecto `v25.0`.

Endpoints:

- `GET /api/webhooks/meta/instagram`
- `POST /api/webhooks/meta/instagram`

Si `META_INSTAGRAM_ACCESS_TOKEN` no esta configurado, las respuestas outbound por Instagram se guardan en modo simulado. El envio real usa `https://graph.instagram.com/{version}/me/messages`.
