# Prueba del webhook de Instagram

Endpoint local:

```text
POST http://localhost:3001/api/webhooks/meta/instagram
```

Payload minimo para simular un mensaje entrante real:

```json
{
  "object": "instagram",
  "entry": [
    {
      "id": "IG_BUSINESS_ID",
      "time": 1710000000,
      "messaging": [
        {
          "sender": { "id": "test-user-123" },
          "recipient": { "id": "IG_BUSINESS_ID" },
          "timestamp": 1710000000000,
          "message": {
            "mid": "test-mid-001",
            "text": "Mensaje de prueba desde webhook"
          }
        }
      ]
    }
  ]
}
```

PowerShell:

```powershell
$payload = @{
  object = "instagram"
  entry = @(
    @{
      id = "IG_BUSINESS_ID"
      time = 1710000000
      messaging = @(
        @{
          sender = @{ id = "test-user-123" }
          recipient = @{ id = "IG_BUSINESS_ID" }
          timestamp = 1710000000000
          message = @{
            mid = "test-mid-001"
            text = "Mensaje de prueba desde webhook"
          }
        }
      )
    }
  )
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3001/api/webhooks/meta/instagram" `
  -ContentType "application/json" `
  -Body $payload
```

Respuesta esperada:

```text
EVENT_RECEIVED
```

Logs esperados:

```text
Meta Instagram webhook accepted object=instagram entries=1 messagingEvents=1 textMessages=1 technicalEvents=0
Instagram webhook context organization=demo-org connection=Instagram Principal
Instagram webhook received=1 direct=1 fallback=0 technical=0
Instagram inbound message saved id=test-mid-001 sender=test-user-123
Instagram webhook processed=1 skipped=0 received=1 syncedFromGraph=0
```

Consultas rapidas en PostgreSQL:

```powershell
docker exec crm_omnicanal_postgres psql -U crm -d crm_omnicanal -c "select id, full_name from contacts where organization_id='demo-org' and tags::text like '%instagram%' order by created_at desc limit 5;"
docker exec crm_omnicanal_postgres psql -U crm -d crm_omnicanal -c "select id, channel, status, assigned_user_id, last_message_at from conversations where organization_id='demo-org' and channel='instagram' order by last_message_at desc nulls last limit 5;"
docker exec crm_omnicanal_postgres psql -U crm -d crm_omnicanal -c "select channel, direction, external_message_id, text, status, created_at from messages where channel='instagram' order by created_at desc limit 5;"
```

Variables a revisar:

```text
META_INSTAGRAM_VERIFY_TOKEN
META_INSTAGRAM_ORGANIZATION_ID
META_INSTAGRAM_ACCESS_TOKEN
META_INSTAGRAM_PAGE_ID
META_INSTAGRAM_BUSINESS_ACCOUNT_ID
META_INSTAGRAM_API_VERSION
META_INSTAGRAM_AUTH_MODE
```

Para el entorno demo local, `META_INSTAGRAM_ORGANIZATION_ID` debe apuntar a una organizacion existente, normalmente:

```text
demo-org
```
