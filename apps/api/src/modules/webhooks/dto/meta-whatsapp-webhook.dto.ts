import { IsArray, IsOptional, IsString } from "class-validator";

class MetaWhatsAppTextDto {
  @IsOptional()
  @IsString()
  body?: string;
}

class MetaWhatsAppProfileDto {
  @IsOptional()
  @IsString()
  name?: string;
}

class MetaWhatsAppContactDto {
  @IsOptional()
  profile?: MetaWhatsAppProfileDto;

  @IsOptional()
  @IsString()
  wa_id?: string;
}

class MetaWhatsAppMessageDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  text?: MetaWhatsAppTextDto;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  type?: string;
}

class MetaWhatsAppValueDto {
  @IsOptional()
  @IsString()
  messaging_product?: string;

  @IsArray()
  @IsOptional()
  contacts?: MetaWhatsAppContactDto[];

  @IsArray()
  @IsOptional()
  messages?: MetaWhatsAppMessageDto[];
}

class MetaWhatsAppChangeDto {
  @IsOptional()
  @IsString()
  field?: string;

  @IsOptional()
  value?: MetaWhatsAppValueDto;
}

class MetaWhatsAppEntryDto {
  @IsArray()
  @IsOptional()
  changes?: MetaWhatsAppChangeDto[];
}

export class MetaWhatsAppWebhookDto {
  @IsArray()
  @IsOptional()
  entry?: MetaWhatsAppEntryDto[];

  @IsOptional()
  @IsString()
  object?: string;
}
