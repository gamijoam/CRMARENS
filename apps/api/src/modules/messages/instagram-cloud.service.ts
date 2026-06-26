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
export class InstagramCloudService {
  constructor(private readonly config: ConfigService) {}

  async sendText(input: SendTextInput): Promise<SendTextResult> {
    const accessToken = this.config.get<string>("META_INSTAGRAM_ACCESS_TOKEN");
    const instagramBusinessAccountId = this.config.get<string>("META_INSTAGRAM_BUSINESS_ACCOUNT_ID");
    const graphVersion = this.config.get<string>("META_INSTAGRAM_API_VERSION") ?? "v25.0";
    const authMode = this.config.get<string>("META_INSTAGRAM_AUTH_MODE") ?? "instagram_login";

    if (!accessToken || (authMode === "facebook_login" && !instagramBusinessAccountId)) {
      return {
        externalMessageId: `ig-simulated-${Date.now()}`,
        rawPayload: {
          mode: "simulated",
          reason: "missing_instagram_credentials",
          to: input.to
        },
        status: "sent"
      };
    }

    try {
      const url =
        authMode === "facebook_login"
          ? `https://graph.facebook.com/${graphVersion}/me/messages`
          : `https://graph.instagram.com/${graphVersion}/me/messages`;
      const response = await fetch(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            recipient: { id: input.to },
            message: { text: input.text }
          })
        }
      );
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        return {
          rawPayload: payload,
          status: "failed"
        };
      }

      return {
        externalMessageId: typeof payload.message_id === "string" ? payload.message_id : undefined,
        rawPayload: {
          ...payload,
          authMode,
          instagramBusinessAccountId,
          url
        },
        status: "sent"
      };
    } catch (error) {
      return {
        rawPayload: {
          error: error instanceof Error ? error.message : "Unknown Instagram API error"
        },
        status: "failed"
      };
    }
  }
}
