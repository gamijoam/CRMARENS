# PRD - CRM Omnicanal MVP

## Objetivo

Construir un CRM SaaS multiempresa para negocios que reciben clientes por WhatsApp, Instagram y Facebook Messenger. El MVP debe priorizar WhatsApp, contactos, leads, embudo comercial, inbox y asignacion de conversaciones a vendedores.

## No objetivos de esta version

- No generar respuestas con IA.
- No calificar leads con IA.
- No usar agentes autonomos.
- No usar scraping ni automatizaciones no oficiales de WhatsApp Web o Instagram.

## Usuarios

- Owner: controla configuracion general, canales, usuarios y datos.
- Admin: gestiona usuarios, canales, pipelines y reportes.
- Supervisor: revisa equipo, conversaciones y reasigna chats.
- Seller: atiende conversaciones, agrega notas y mueve leads.

## MVP inicial

1. Auth.
2. Organizations.
3. Users/Roles.
4. Contacts.
5. Leads/Pipelines.
6. Conversations/Messages.
7. WhatsApp webhook y envio.
8. Routing bot simple.
9. Asignacion round-robin y vendedor anterior.
10. Panel basico de vendedor y admin.
