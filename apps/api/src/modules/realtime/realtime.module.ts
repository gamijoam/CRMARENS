import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { RealtimeService } from "./realtime.service";

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeService],
  exports: [RealtimeService]
})
export class RealtimeModule {}
