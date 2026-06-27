import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { RealtimeService } from "./modules/realtime/realtime.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>("WEB_URL") ?? "http://localhost:3000",
    credentials: true
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const port = config.get<number>("PORT") ?? 3001;
  app.get(RealtimeService).attach(app.getHttpServer());
  await app.listen(port);
}

void bootstrap();
