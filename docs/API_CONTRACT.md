# API Contract Inicial

Prefijo global: `/api`

## Auth

- `POST /auth/login`: inicia sesion.
- `GET /auth/me`: devuelve usuario actual desde JWT.

## Organizations

- `POST /organizations`: crea organizacion.
- `GET /organizations/:id`: obtiene organizacion.
- `GET /organizations/:id/users`: lista usuarios de una organizacion.

## Users

- `POST /users`: crea usuario y lo vincula a una organizacion.
- `GET /users/:id`: obtiene usuario.

## Futuro

- `POST /contacts`
- `GET /contacts`
- `POST /leads`
- `PATCH /leads/:id/stage`
- `GET /conversations`
- `POST /conversations/:id/messages`
- `POST /webhooks/meta/whatsapp`
