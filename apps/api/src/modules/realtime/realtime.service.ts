import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { AuthenticatedUser } from "../../shared/authenticated-user";

interface RealtimeClient {
  organizationId: string;
  socket: WebSocket;
  userId: string;
}

export interface RealtimeEvent {
  channel?: string;
  conversationId?: string;
  messageId?: string;
  organizationId: string;
  type: "message.created" | "conversation.updated" | "sync.completed";
}

@Injectable()
export class RealtimeService {
  private readonly clients = new Set<RealtimeClient>();
  private readonly logger = new Logger(RealtimeService.name);
  private server?: WebSocketServer;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService
  ) {}

  attach(httpServer: Server) {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (request, socket, head) => {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      if (requestUrl.pathname !== "/realtime") {
        return;
      }

      const token = requestUrl.searchParams.get("token");
      const user = this.verifyToken(token);
      if (!user?.organizationId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      this.server?.handleUpgrade(request, socket, head, (webSocket) => {
        this.registerClient(webSocket, user);
      });
    });
  }

  emitToOrganization(event: RealtimeEvent) {
    const payload = JSON.stringify({
      ...event,
      emittedAt: new Date().toISOString()
    });
    let delivered = 0;

    for (const client of this.clients) {
      if (client.organizationId !== event.organizationId || client.socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      client.socket.send(payload);
      delivered += 1;
    }

    if (delivered > 0) {
      this.logger.log(`Realtime event=${event.type} organization=${event.organizationId} delivered=${delivered}`);
    }
  }

  private registerClient(socket: WebSocket, user: AuthenticatedUser) {
    const client: RealtimeClient = {
      organizationId: user.organizationId ?? "",
      socket,
      userId: user.sub
    };

    this.clients.add(client);
    socket.send(JSON.stringify({ type: "connected", organizationId: client.organizationId }));
    socket.on("close", () => {
      this.clients.delete(client);
    });
    socket.on("error", () => {
      this.clients.delete(client);
    });
  }

  private verifyToken(token: string | null) {
    if (!token) {
      return undefined;
    }

    try {
      return this.jwt.verify<AuthenticatedUser>(token, {
        secret: this.config.get<string>("JWT_SECRET") ?? "change-me-in-development"
      });
    } catch {
      return undefined;
    }
  }
}
