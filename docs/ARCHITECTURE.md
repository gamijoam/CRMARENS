# Arquitectura

La arquitectura inicial es un monolito modular:

```text
apps/web  -> Next.js
apps/api  -> NestJS
packages/shared -> tipos compartidos
PostgreSQL -> datos principales
Redis -> colas y trabajos
```

## Principios

- Multiempresa desde el primer dia usando `organization_id`.
- RBAC basico: `owner`, `admin`, `supervisor`, `seller`.
- Integraciones externas encapsuladas en adaptadores.
- Todo canal externo se normaliza a `NormalizedMessage`.
- El CRM no contiene IA funcional en el MVP.

## Modulos backend

- `auth`
- `organizations`
- `users`
- `contacts`
- `leads`
- `pipelines`
- `conversations`
- `messages`
- `channels`
- `routing-bot`
- `assignments`
- `reports`
- `audit`
