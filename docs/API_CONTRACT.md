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

## Contacts

- `POST /contacts`: crea contacto dentro de la organizacion activa.
- `GET /contacts`: lista contactos de la organizacion activa. Acepta `?search=`.
- `GET /contacts/:id`: obtiene contacto con canales, leads y ultimas conversaciones.
- `PATCH /contacts/:id`: actualiza datos y reemplaza canales si se envian.
- `DELETE /contacts/:id`: elimina contacto de la organizacion activa.

## Futuro

- `POST /leads`
- `PATCH /leads/:id/stage`
- `GET /conversations`
- `POST /conversations/:id/messages`
- `POST /webhooks/meta/whatsapp`
