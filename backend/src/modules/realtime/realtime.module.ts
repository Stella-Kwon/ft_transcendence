 import { FastifyPluginAsync } from "fastify";
import { RoomService } from "./room.service";
import { ConnectionService } from "./connection.service";
import { MessageService } from "./message.service";
import { WebSocketService } from "./websocket.service";
import { WebSocketConnectionManager } from "./websocket-connection.manager";
import { WebSocketMessageHandler } from "./websocket-message.handler";
import { FriendshipService } from "./friendship.service";
import { EventService } from "./event.service";
import { EventListenerService } from "./event-listener.service";
import { SyncService } from "./sync.service";
import { friendshipController } from "./friendship.controller";
import { roomController } from "./room.controller";

declare module "fastify" {
	interface FastifyInstance {
		roomService: RoomService;
		connectionService: ConnectionService;
		messageService: MessageService;
		websocketService: WebSocketService;
		websocketConnectionManager: WebSocketConnectionManager;
		websocketMessageHandler: WebSocketMessageHandler;
		syncService: SyncService;
		friendshipService: FriendshipService;
		eventService: EventService;
		eventListenerService: EventListenerService;
	}
}

export const realtimeModule: FastifyPluginAsync = async (fastify, options) => {
  const eventService = new EventService();
  const connectionService = new ConnectionService();
  const roomService = new RoomService(eventService);
  const syncService = new SyncService();
  const messageService = new MessageService();
  const friendshipService = new FriendshipService(connectionService, eventService);
  
  syncService.setDependencies(roomService, friendshipService, messageService, eventService);
  
  const eventListenerService = new EventListenerService(
    eventService,
    connectionService,
    friendshipService,
    fastify.orm
  );
  
  const websocketService = new WebSocketService(roomService, connectionService, messageService, eventService, syncService, eventListenerService);

  fastify.decorate('roomService', roomService);
  fastify.decorate('connectionService', connectionService);
  fastify.decorate('messageService', messageService);
  fastify.decorate('eventService', eventService);
  fastify.decorate('eventListenerService', eventListenerService);
  fastify.decorate('friendshipService', friendshipService);
  fastify.decorate('syncService', syncService);
  fastify.decorate('websocketService', websocketService);


  //extended the websocket plugin with custom login
  // -> register it as plugin to ensure it is ready during the app's loading
  await fastify.register(websocketService.plugin);
  //need to be ready from the start in order to know where to call what route
  fastify.register(roomController);
  fastify.register(friendshipController)

}; 