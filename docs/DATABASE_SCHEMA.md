# Database Schema

El schema inicial vive en `apps/api/prisma/schema.prisma`.

## Tablas base incluidas

- `organizations`
- `users`
- `organization_users`
- `contacts`
- `contact_channels`
- `pipelines`
- `pipeline_stages`
- `leads`
- `conversations`
- `messages`
- `audit_logs`

## Reglas

- Las tablas de negocio deben tener `organization_id`.
- Las consultas de negocio deben filtrar por organizacion activa.
- Los secretos de canales Meta se agregaran cifrados cuando se implemente `channel_connections`.
