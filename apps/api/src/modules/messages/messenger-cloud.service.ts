import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";

interface SendTextInput {
  organizationId: string;
  text: string;
  to: string;
}

interface SendTextResult {
  externalMessageId?: string;
  rawPayload: Record<string, unknown>;
  status: "failed" | "sent";
}

@Injectable()
export class MessengerCloudService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async sendText(input: SendTextInput): Promise<SendTextResult> {
    const accessToken = await this.getAccessToken(input.organizationId);
    const graphVersion = this.config.get<string>("META_FACEBOOK_API_VERSION") ?? "v25.0";

    if (!accessToken) {
      return {
        rawPayload: {
          reason: "missing_facebook_credentials",
          to: input.to
        },
        status: "failed"
      };
    }

    try {
      const url = `https://graph.facebook.com/${graphVersion}/me/messages`;
      const response = await this.fetchWithRetry(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recipient: { id: input.to },
          message: { text: input.text }
        })
      });
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
          url
        },
        status: "sent"
      };
    } catch (error) {
      return {
        rawPayload: {
          error: this.formatFetchError(error)
        },
        status: "failed"
      };
    }
  }

  private async fetchWithRetry(url: string, init: RequestInit) {
    try {
      return await fetch(url, init);
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      try {
        return await fetch(url, init);
      } catch (retryError) {
        throw retryError instanceof Error ? retryError : error;
      }
    }
  }

  private async getAccessToken(organizationId: string) {
    const connection = await this.prisma.channelConnection.findFirst({
      where: {
        organizationId,
        channel: "messenger",
        status: "active"
      },
      orderBy: { updatedAt: "desc" },
      select: { config: true }
    });
    const dbToken = this.readConfigString(connection?.config, "accessToken");

    return dbToken ?? this.config.get<string>("META_FACEBOOK_PAGE_ACCESS_TOKEN");
  }

  private readConfigString(config: unknown, key: string) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return undefined;
    }

    const value = (config as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private formatFetchError(error: unknown) {
    if (!(error instanceof Error)) {
      return "Unknown Messenger API error";
    }

    const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
    return `${error.message}${cause}`;
  }
}
