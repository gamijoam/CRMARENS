import { Body, Controller, Get, HttpCode, Logger, Post, Query, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { requireRole } from "../../shared/require-role";
import { MetaInstagramWebhookDto } from "./dto/meta-instagram-webhook.dto";
import { MetaWhatsAppWebhookDto } from "./dto/meta-whatsapp-webhook.dto";
import { WebhooksService } from "./webhooks.service";

const DEFAULT_META_INSTAGRAM_VERIFY_TOKEN = "MiTokenSeguro123_";
const DEFAULT_META_FACEBOOK_VERIFY_TOKEN = DEFAULT_META_INSTAGRAM_VERIFY_TOKEN;

@Controller("webhooks")
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly webhooksService: WebhooksService
  ) {}

  @Get("meta/whatsapp")
  verifyMetaWhatsapp(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") verifyToken?: string,
    @Query("hub.challenge") challenge?: string
  ) {
    const expectedToken = this.config.get<string>("META_WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && expectedToken && verifyToken === expectedToken) {
      return challenge ?? "";
    }

    throw new UnauthorizedException("Invalid webhook verification token");
  }

  @Post("meta/whatsapp")
  @HttpCode(200)
  async receiveMetaWhatsapp(@Body() dto: MetaWhatsAppWebhookDto) {
    return this.webhooksService.receiveMetaWhatsapp(dto);
  }

  @Get("meta/instagram")
  verifyMetaInstagram(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") verifyToken: string | undefined,
    @Query("hub.challenge") challenge: string | undefined,
    @Res() response: Response
  ) {
    const expectedToken =
      this.config.get<string>("META_INSTAGRAM_VERIFY_TOKEN") ?? DEFAULT_META_INSTAGRAM_VERIFY_TOKEN;
    const allowedTokens = Array.from(new Set([expectedToken, DEFAULT_META_INSTAGRAM_VERIFY_TOKEN].filter(Boolean)));

    if (mode === "subscribe" && verifyToken && allowedTokens.includes(verifyToken)) {
      return response.status(200).type("text/plain").send(challenge ?? "");
    }

    this.logger.warn(
      `Meta Instagram webhook verification failed mode=${mode ?? "missing"} tokenProvided=${Boolean(verifyToken)}`
    );
    throw new UnauthorizedException("Invalid webhook verification token");
  }

  @Post("meta/instagram")
  receiveMetaInstagram(@Body() body: Record<string, unknown>, @Res() response: Response) {
    this.logger.log(this.summarizeInstagramWebhook(body));

    response.status(200).send("EVENT_RECEIVED");

    void this.webhooksService
      .receiveMetaInstagram(body as unknown as MetaInstagramWebhookDto)
      .catch((error: unknown) => {
        this.logger.error(
          `Meta Instagram webhook async processing failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      });
  }

  @Get("meta/facebook")
  verifyMetaFacebook(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") verifyToken: string | undefined,
    @Query("hub.challenge") challenge: string | undefined,
    @Res() response: Response
  ) {
    const expectedToken =
      this.config.get<string>("META_FACEBOOK_VERIFY_TOKEN") ??
      DEFAULT_META_FACEBOOK_VERIFY_TOKEN;

    if (mode === "subscribe" && expectedToken && verifyToken === expectedToken) {
      return response.status(200).type("text/plain").send(challenge ?? "");
    }

    this.logger.warn(
      `Meta Facebook webhook verification failed mode=${mode ?? "missing"} tokenProvided=${Boolean(verifyToken)}`
    );
    throw new UnauthorizedException("Invalid webhook verification token");
  }

  @Post("meta/facebook")
  receiveMetaFacebook(@Body() body: Record<string, unknown>, @Res() response: Response) {
    this.logger.log(this.summarizeMessengerWebhook(body));

    response.status(200).send("EVENT_RECEIVED");

    void this.webhooksService
      .receiveMetaFacebook(body as unknown as MetaInstagramWebhookDto)
      .catch((error: unknown) => {
        this.logger.error(
          `Meta Facebook webhook async processing failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      });
  }

  @UseGuards(JwtAuthGuard)
  @Post("meta/instagram/sync")
  syncMetaInstagram(@CurrentUser() user: AuthenticatedUser, @Body() body?: { force?: boolean }) {
    requireRole(user, ["owner", "admin"]);
    return this.webhooksService.syncInstagramForOrganization(requireOrganization(user), {
      force: body?.force === true,
      reason: body?.force === true ? "manual_force" : "manual"
    });
  }

  private summarizeInstagramWebhook(body: Record<string, unknown>) {
    const entries = Array.isArray(body.entry) ? body.entry : [];
    let messagingEvents = 0;
    let messagesWithText = 0;
    let technicalEvents = 0;

    for (const rawEntry of entries) {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
        continue;
      }

      const entry = rawEntry as Record<string, unknown>;
      const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
      messagingEvents += messaging.length;

      for (const rawEvent of messaging) {
        if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) {
          continue;
        }

        const event = rawEvent as Record<string, unknown>;
        const message = event.message && typeof event.message === "object" ? event.message as Record<string, unknown> : undefined;
        if (typeof message?.text === "string") {
          messagesWithText += 1;
        }
        if (event.message_edit || event.reaction || event.delivery || event.read || event.standby) {
          technicalEvents += 1;
        }
      }
    }

    return `Meta Instagram webhook accepted object=${typeof body.object === "string" ? body.object : "unknown"} entries=${entries.length} messagingEvents=${messagingEvents} textMessages=${messagesWithText} technicalEvents=${technicalEvents}`;
  }

  private summarizeMessengerWebhook(body: Record<string, unknown>) {
    const entries = Array.isArray(body.entry) ? body.entry : [];
    let messagingEvents = 0;
    let messagesWithText = 0;

    for (const rawEntry of entries) {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
        continue;
      }

      const entry = rawEntry as Record<string, unknown>;
      const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
      messagingEvents += messaging.length;

      for (const rawEvent of messaging) {
        if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) {
          continue;
        }

        const event = rawEvent as Record<string, unknown>;
        const message = event.message && typeof event.message === "object" ? event.message as Record<string, unknown> : undefined;
        if (typeof message?.text === "string") {
          messagesWithText += 1;
        }
      }
    }

    return `Meta Facebook webhook accepted object=${typeof body.object === "string" ? body.object : "unknown"} entries=${entries.length} messagingEvents=${messagingEvents} textMessages=${messagesWithText}`;
  }
}
