import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface SendTextInput {
  text: string;
  to: string;
}

interface SendTextResult {
  externalMessageId?: string;
  rawPayload: Record<string, unknown>;
  status: "failed" | "sent";
}

@Injectable()
export class WhatsappCloudService {
  constructor(private readonly config: ConfigService) {}

  async sendText(input: SendTextInput): Promise<SendTextResult> {
    const accessToken = this.config.get<string>("META_WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = this.config.get<string>("META_WHATSAPP_PHONE_NUMBER_ID");
    const graphVersion = this.config.get<string>("META_GRAPH_API_VERSION") ?? "v23.0";
    const recipient = this.normalizeRecipient(input.to);

    if (!accessToken || !phoneNumberId) {
      return {
        externalMessageId: `simulated-${Date.now()}`,
        rawPayload: {
          mode: "simulated",
          reason: "missing_meta_credentials",
          to: recipient
        },
        status: "sent"
      };
    }

    try {
      const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: {
            preview_url: false,
            body: input.text
          }
        })
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        return {
          rawPayload: payload,
          status: "failed"
        };
      }

      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const firstMessage = messages[0] as { id?: string } | undefined;
      return {
        externalMessageId: firstMessage?.id,
        rawPayload: payload,
        status: "sent"
      };
    } catch (error) {
      return {
        rawPayload: {
          error: error instanceof Error ? error.message : "Unknown WhatsApp Cloud API error"
        },
        status: "failed"
      };
    }
  }

  private normalizeRecipient(value: string) {
    return value.replace(/[^\d]/g, "");
  }
}
