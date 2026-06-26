import { Body, Controller, Get, HttpCode, Post, Query, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import { MetaInstagramWebhookDto } from "./dto/meta-instagram-webhook.dto";
import { MetaWhatsAppWebhookDto } from "./dto/meta-whatsapp-webhook.dto";
import { WebhooksService } from "./webhooks.service";

const META_INSTAGRAM_VERIFY_TOKEN = "MiTokenSeguro123_";

@Controller("webhooks")
export class WebhooksController {
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
    if (mode === "subscribe" && verifyToken === META_INSTAGRAM_VERIFY_TOKEN) {
      return response.status(200).type("text/plain").send(challenge ?? "");
    }

    throw new UnauthorizedException("Invalid webhook verification token");
  }

  @Post("meta/instagram")
  @HttpCode(200)
  async receiveMetaInstagram(@Body() dto: MetaInstagramWebhookDto) {
    return this.webhooksService.receiveMetaInstagram(dto);
  }
}
