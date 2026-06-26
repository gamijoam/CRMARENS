import { WebhooksService } from "./webhooks.service";

describe("WebhooksService Instagram parsing", () => {
  function createService() {
    return new WebhooksService({} as never, {} as never, {} as never);
  }

  it("extracts text messages from Instagram messaging payloads", () => {
    const service = createService() as unknown as {
      extractInstagramMessages: (payload: unknown) => Array<{
        externalMessageId: string;
        from: string;
        text: string;
        timestamp?: number | string;
      }>;
    };

    const messages = service.extractInstagramMessages({
      object: "instagram",
      entry: [
        {
          id: "IG_BUSINESS_ID",
          time: 1710000000,
          messaging: [
            {
              sender: { id: "test-user-123" },
              recipient: { id: "IG_BUSINESS_ID" },
              timestamp: 1710000000000,
              message: {
                mid: "test-mid-001",
                text: "Mensaje de prueba desde webhook"
              }
            }
          ]
        }
      ]
    });

    expect(messages).toEqual([
      {
        externalMessageId: "test-mid-001",
        from: "test-user-123",
        text: "Mensaje de prueba desde webhook",
        timestamp: 1710000000000
      }
    ]);
  });

  it("ignores Instagram message_edit technical events", () => {
    const service = createService() as unknown as {
      extractInstagramMessages: (payload: unknown) => unknown[];
      extractInstagramMessageLookupRefs: (payload: unknown) => unknown[];
    };

    const payload = {
      object: "instagram",
      entry: [
        {
          id: "IG_BUSINESS_ID",
          time: 1710000000,
          messaging: [
            {
              timestamp: 1710000000000,
              message_edit: {
                mid: "edited-mid-001"
              }
            }
          ]
        }
      ]
    };

    expect(service.extractInstagramMessages(payload)).toEqual([]);
    expect(service.extractInstagramMessageLookupRefs(payload)).toEqual([]);
  });
});
