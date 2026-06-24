import { IsArray, IsNumber, IsObject, IsOptional, IsString } from "class-validator";

class MetaInstagramUserDto {
  @IsOptional()
  @IsString()
  id?: string;
}

class MetaInstagramMessageDto {
  @IsOptional()
  @IsString()
  mid?: string;

  @IsObject()
  @IsOptional()
  quick_reply?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  text?: string;
}

class MetaInstagramMessagingDto {
  @IsOptional()
  message?: MetaInstagramMessageDto;

  @IsOptional()
  recipient?: MetaInstagramUserDto;

  @IsOptional()
  sender?: MetaInstagramUserDto;

  @IsNumber()
  @IsOptional()
  timestamp?: number;
}

class MetaInstagramChangeDto {
  @IsOptional()
  @IsString()
  field?: string;

  @IsObject()
  @IsOptional()
  value?: Record<string, unknown>;
}

class MetaInstagramEntryDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsArray()
  @IsOptional()
  changes?: MetaInstagramChangeDto[];

  @IsArray()
  @IsOptional()
  messaging?: MetaInstagramMessagingDto[];

  @IsOptional()
  time?: number;
}

export class MetaInstagramWebhookDto {
  @IsArray()
  @IsOptional()
  entry?: MetaInstagramEntryDto[];

  @IsOptional()
  @IsString()
  field?: string;

  @IsOptional()
  @IsString()
  object?: string;

  @IsObject()
  @IsOptional()
  value?: Record<string, unknown>;
}
