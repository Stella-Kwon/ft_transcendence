
export interface UserConnection {
  connectionId: string;
  socketId: string;
  email: string;
  userId: string;
  name: string;
  connectedAt: string;
}

export class ConnectionService {
  private connections = new Map<string, UserConnection>(); // connectionId -> UserConnection
  private userConnections = new Map<string, Set<string>>(); // userId -> Set<connectionId>

  constructor() {}

  createConnection(connectionId: string, socketId: string, email: string, userId: string, name: string): UserConnection {
    const connection: UserConnection = {
      connectionId,
      socketId,
      email,
      userId,
      name,
      connectedAt: new Date().toISOString()
    };

    this.connections.set(connectionId, connection);

    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);

    return connection;
  }

  getConnectionByUserId(userId: string): UserConnection | undefined {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds || connectionIds.size === 0) return undefined;
    const firstConnectionId = connectionIds.values().next().value;
    return this.connections.get(firstConnectionId);
  }

  // Get all connections for a user
  getUserConnections(userId: string): UserConnection[] {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) return [];

    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter((conn): conn is UserConnection => conn !== undefined);
  }

  removeConnection(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }
    const userId = connection.userId;
    this.connections.delete(connectionId);

    const userConnections = this.userConnections.get(userId);
    if (userConnections) {
      userConnections.delete(connectionId);

      if (userConnections.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    return true;
  }

  // Get all connections
  getAllConnections(): UserConnection[] {
    return Array.from(this.connections.values());
  }

  // Get all online users (unique per userId)
  getOnlineUsers(): UserConnection[] {
    const onlineUsers = new Map<string, UserConnection>();

    for (const connection of this.connections.values()) {
      if (!onlineUsers.has(connection.userId)) {
        onlineUsers.set(connection.userId, connection);
      }
    }
    return Array.from(onlineUsers.values());
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    const userConnections = this.userConnections.get(userId);
    return userConnections ? userConnections.size > 0 : false;
  }
}
