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

- `POST /users`: crea usuario y lo vincula a la organizacion activa. Requiere rol `owner` o `admin`.
- `GET /users`: lista miembros activos de la organizacion activa.
- `GET /users/:id`: obtiene usuario si pertenece a la organizacion activa.

## Contacts

- `POST /contacts`: crea contacto dentro de la organizacion activa.
- `GET /contacts`: lista contactos de la organizacion activa. Acepta `?search=`.
- `GET /contacts/:id`: obtiene contacto con canales, leads y ultimas conversaciones.
- `PATCH /contacts/:id`: actualiza datos y reemplaza canales si se envian.
- `DELETE /contacts/:id`: elimina contacto de la organizacion activa.

## Channel Connections

- `POST /channel-connections`: crea conexion simulada por canal. Requiere rol `owner` o `admin`.
- `GET /channel-connections`: lista conexiones de la organizacion activa.
- `GET /channel-connections/:id`: obtiene conexion de la organizacion activa.
- `PATCH /channel-connections/:id/status`: activa o desactiva conexion. Requiere rol `owner` o `admin`.

## Pipelines

- `POST /pipelines`: crea pipeline con etapas personalizadas u opciones por defecto.
- `GET /pipelines`: lista pipelines con etapas y conteo de leads.
- `GET /pipelines/:id`: obtiene pipeline con etapas.
- `PATCH /pipelines/:id/stages/reorder`: reordena etapas existentes.

## Leads

- `POST /leads`: crea oportunidad asociada a un contacto.
- `GET /leads`: lista leads. Acepta `pipelineId`, `stageId` y `status`.
- `GET /leads/:id`: obtiene lead con contacto, pipeline, etapa y vendedor asignado.
- `PATCH /leads/:id/assign`: asigna o libera responsable.
- `PATCH /leads/:id/stage`: mueve lead a otra etapa del mismo pipeline.
- `PATCH /leads/:id/status`: cambia estado entre `open`, `won` y `lost`.

## Notes

- `POST /notes`: crea nota interna asociada a contacto o lead.
- `GET /notes`: lista notas. Acepta `contactId` y `leadId`.
- `GET /notes/:id`: obtiene nota.
- `PATCH /notes/:id`: actualiza contenido de la nota.
- `DELETE /notes/:id`: elimina nota.

## Tasks

- `POST /tasks`: crea tarea asociada a contacto o lead.
- `GET /tasks`: lista tareas. Acepta `contactId`, `leadId`, `assignedUserId` y `status`.
- `GET /tasks/:id`: obtiene tarea.
- `PATCH /tasks/:id`: actualiza titulo, descripcion, vencimiento o asignacion.
- `PATCH /tasks/:id/assign`: asigna o libera responsable.
- `PATCH /tasks/:id/status`: cambia estado entre `open`, `done` y `canceled`.

## Conversations

- `POST /conversations`: crea conversacion asociada a contacto. Puede recibir `channelConnectionId`.
- `GET /conversations`: lista conversaciones. Acepta `status`, `assignedUserId`, `contactId` y `channel`.
- `GET /conversations/:id`: obtiene conversacion con contacto y mensajes.
- `PATCH /conversations/:id/assign`: asigna o libera vendedor.
- `PATCH /conversations/:id/close`: cierra conversacion.

## Messages

- `POST /conversations/:conversationId/messages`: crea mensaje inbound u outbound.
- `GET /conversations/:conversationId/messages`: lista mensajes de una conversacion.
- `PATCH /conversations/:conversationId/messages/:messageId/status`: actualiza estado del mensaje.

## Futuro

- `POST /webhooks/meta/whatsapp`
