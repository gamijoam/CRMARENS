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
