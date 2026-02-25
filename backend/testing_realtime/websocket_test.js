#!/usr/bin/env node

const WebSocket = require("ws");
const https = require("https");
const http = require("http");
const { URLSearchParams } = require("url");

// allow Self-signed cert 
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

class WebSocketTester {
  constructor() {
    this.baseUrl = "https://localhost:3000";
    this.wsUrl = "wss://localhost:3000/api/realtime/ws";
    this.testResults = [];
    this.cookies = "";
    this.userId = null;
    this.userName = null;
    this.roomId = null;
    this.ws = null;
    this.messageHandlers = new Map();
    this.testTimeout = 30000; // 30초 타임아웃
  }

  // Color codes for console output
  colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
  };

  // Generate UUID for message ID
  generateId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  log(message, color = "reset") {
    console.log(`${this.colors[color]}${message}${this.colors.reset}`);
  }

  logStep(message) {
    this.log(`\n📋 ${message}`, "cyan");
  }

  logSuccess(message) {
    this.log(`✅ ${message}`, "green");
  }

  logError(message) {
    this.log(`❌ ${message}`, "red");
  }

  logInfo(message) {
    this.log(`ℹ️  ${message}`, "blue");
  }

  logWarning(message) {
    this.log(`⚠️  ${message}`, "yellow");
  }

  // HTTP request helper
  async makeRequest(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "localhost",
        port: 3000,
        path: `/api${path}`,
        method: method,
        rejectUnauthorized: false,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      };

      if (this.cookies) {
        options.headers.Cookie = this.cookies;
      }

      const req = https.request(options, (res) => {
        let responseData = "";

        res.on("data", (chunk) => {
          responseData += chunk;
        });

        res.on("end", () => {
          // Extract cookies from response
          if (res.headers["set-cookie"]) {
            this.cookies = res.headers["set-cookie"].join("; ");
          }

          try {
            const parsedData = JSON.parse(responseData);
            resolve({
              statusCode: res.statusCode,
              data: parsedData,
              headers: res.headers,
            });
          } catch (error) {
            resolve({
              statusCode: res.statusCode,
              data: responseData,
              headers: res.headers,
            });
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // Setup test environment
  async setupTestEnvironment() {
    this.logStep("Setting up test environment");

    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    const email = `wstest_${timestamp}_${randomNum}@test.com`;
    const name = `WebSocket Test User ${timestamp}_${randomNum}`;
    const username = `wstest${timestamp}${randomNum}`;

    try {
      // Clear cookies to start fresh
      this.cookies = "";

      // First, try to logout if already logged in
      try {
        await this.makeRequest("POST", "/auth/logout");
      } catch (logoutError) {
        // Ignore logout errors - might not be logged in
      }

      // Register user
      this.logInfo("Registering test user...");
      const registerResponse = await this.makeRequest(
        "POST",
        "/auth/register",
        {
          email,
          name,
          username,
          password: "password123",
          avatarUrl: "/files/avatar.png",
        }
      );

      if (registerResponse.statusCode === 201) {
        // register가 자동으로 로그인 처리함 (accessToken 쿠키 세팅)
        this.userId = registerResponse.data.id;
        this.userName = registerResponse.data.name;
      } else if (registerResponse.statusCode === 400) {
        // 이미 존재하는 유저 → 로그아웃 후 로그인
        await this.makeRequest("POST", "/auth/logout");
        this.logInfo("Logging in test user...");
        const loginResponse = await this.makeRequest("POST", "/auth/login/password", {
          email,
          password: "password123",
        });
        if (loginResponse.statusCode !== 200) {
          throw new Error(`Login failed: ${JSON.stringify(loginResponse.data)}`);
        }
        this.userId = loginResponse.data.id;
        this.userName = loginResponse.data.name;
      } else {
        throw new Error(
          `Registration failed: ${JSON.stringify(registerResponse.data)}`
        );
      }

      this.logSuccess(`Test user created: ${this.userName} (${this.userId})`);
      return true;
    } catch (error) {
      this.logError(`Setup failed: ${error.message}`);
      return false;
    }
  }

  // Create test room
  async createTestRoom() {
    this.logStep("Creating test room");

    try {
      const response = await this.makeRequest("POST", "/realtime/rooms", {
        name: `WebSocket Test Room $Date.now()}`,
        description: "Room for WebSocket testing",
        isPrivate: false,
        maxUsers: 10,
      });

      if (response.statusCode !== 201) {
        throw new Error(
          `Room creation failed: ${JSON.stringify(response.data)}`
        );
      }

      this.roomId = response.data.id;
      this.logSuccess(`Test room created: ${this.roomId}`);
      return true;
    } catch (error) {
      this.logError(`Room creation failed: ${error.message}`);
      return false;
    }
  }

  // Connect to WebSocket
  async connectWebSocket() {
    this.logStep("Connecting to WebSocket");

    return new Promise((resolve, reject) => {
      const wsOptions = {
        headers: {
          Cookie: this.cookies,
        },
      };

      console.log("🔗 Connecting to WebSocket with cookies:", this.cookies);

      this.ws = new WebSocket(this.wsUrl, { ...wsOptions, rejectUnauthorized: false });

      this.ws.on("open", () => {
        this.logSuccess("WebSocket connection established");
        // console.log("✅ WebSocket readyState:", this.ws.readyState);
        this.setupMessageHandlers();
        resolve(true);
      });

      this.ws.on("error", (error) => {
        this.logError(`WebSocket connection failed: ${error.message}`);
        console.error("❌ WebSocket error details:", error);
        reject(error);
      });

      this.ws.on("close", (code, reason) => {
        const closeReasons = {
          1000: "Normal closure",
          1001: "Going away",
          1002: "Protocol error",
          1003: "Unsupported data",
          1005: "No status received (normal)",
          1006: "Abnormal closure",
          1007: "Invalid frame payload data",
          1008: "Policy violation",
          1009: "Message too big",
          1010: "Extension required",
          1011: "Internal error",
          1012: "Service restart",
          1013: "Try again later",
          1014: "Bad gateway",
          1015: "TLS handshake",
        };

        const reasonText = closeReasons[code] || "Unknown";

        // 정상 종료 코드들은 경고가 아닌 정보로 표시
        const normalCloseCodes = [1000, 1001, 1005];
        if (normalCloseCodes.includes(code)) {
          this.logInfo(`WebSocket connection closed: ${code} - ${reasonText}`);
        } else {
          this.logWarning(
            `WebSocket connection closed: ${code} - ${reasonText}`
          );
        }

        console.log(
          "🔚 WebSocket close details - Code:",
          code,
          "Reason:",
          reasonText
        );
      });

      // Timeout
      setTimeout(() => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          this.logError("WebSocket connection timeout");
          console.log(
            "⏰ WebSocket readyState at timeout:",
            this.ws.readyState
          );
          reject(new Error("Connection timeout"));
        }
      }, 5000);
    });
  }

  // Setup message handlers
  setupMessageHandlers() {
    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.logInfo(`Received: ${message.type}`);
        console.log(
          "🔍 Full received message:",
          JSON.stringify(message, null, 2)
        );

        // Call specific handler if exists
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          handler(message);
        } else {
          // emit으로 직접 전송되는 메시지들은 핸들러가 없어도 정상
          const emitMessages = ["friend_list", "unread_count", "notification"];
          if (!emitMessages.includes(message.type)) {
            console.log(`⚠️  No handler for message type: ${message.type}`);
          }
        }

        // Log detailed message for debugging
        if (process.env.DEBUG) {
          console.log("Full message:", JSON.stringify(message, null, 2));
        }
      } catch (error) {
        this.logError(`Failed to parse message: ${error.message}`);
        console.log("Raw message data:", data.toString());
      }
    });
  }

  // Send message with promise
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      try {
        this.ws.send(JSON.stringify(message));
        this.logInfo(`Sent: ${message.type}`);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Wait for specific message type
  waitForMessage(messageType, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.messageHandlers.delete(messageType);
        reject(new Error(`Timeout waiting for ${messageType}`));
      }, timeout);

      this.messageHandlers.set(messageType, (message) => {
        clearTimeout(timeoutId);
        this.messageHandlers.delete(messageType);
        resolve(message);
      });
    });
  }

  // Test ping/pong
  async testPingPong() {
    console.log("📋 Testing Ping/Pong");

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log("❌ Ping/Pong test failed: Timeout waiting for pong");
        resolve(false);
      }, 10000); // 10초로 늘림

      let friendListReceived = false;
      let pingSent = false;

      const messageHandler = (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log("📨 Received:", message.type);

          // friend_list는 무시하고 pong만 처리
          if (message.type === "pong") {
            clearTimeout(timeout);
            this.ws.removeListener("message", messageHandler);
            console.log("✅ Ping/Pong test passed");
            resolve(true);
          }
          // friend_list는 무시 (연결 시 자동으로 오는 메시지)
          else if (message.type === "friend_list") {
            console.log(
              "ℹ️  Ignoring friend_list message (connection initialization)"
            );
            friendListReceived = true;

            // friend_list 받은 후에 잠시 대기 후 ping 보내기
            setTimeout(() => {
              if (!pingSent) {
                pingSent = true;
                console.log("📤 Sending ping after friend_list");
                this.ws.send(JSON.stringify({ type: "ping" }));
              }
            }, 500); // 500ms 대기
          }
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      };

      this.ws.on("message", messageHandler);

      // friend_list가 오지 않으면 바로 ping 보내기
      setTimeout(() => {
        if (!pingSent) {
          pingSent = true;
          console.log("📤 Sending ping (no friend_list received)");
          this.ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 2000); // 2초로 늘림
    });
  }

  // Test room synchronization
  async testRoomSync() {
    this.logStep("Testing Room Synchronization");

    try {
      // 먼저 채팅 메시지들을 보내서 데이터 생성
      console.log("📤 Sending test messages for sync test...");
      const testMessages = [
        "Sync test message 1",
        "Sync test message 2",
        "Sync test message 3",
      ];

      for (let i = 0; i < testMessages.length; i++) {
        await this.sendMessage({
          type: "chat",
          payload: {
            roomId: this.roomId,
            userId: this.userId,
            name: this.userName,
            content: testMessages[i],
            messageType: "text",
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 300)); // 300ms 대기
      }

      // 잠시 대기 후 sync 요청
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const syncMessage = {
        id: this.generateId(),
        type: "room_state",
        payload: {
          room: { id: this.roomId },
        },
        timestamp: Date.now(),
        version: "1.0",
      };

      // Send sync and wait for room_state
      const roomStatePromise = this.waitForMessage("room_state", 10000);
      await this.sendMessage(syncMessage);

      const roomStateMessage = await roomStatePromise;

      // Validate room state structure
      if (!roomStateMessage.payload || !roomStateMessage.payload.room) {
        throw new Error("Invalid room state message structure");
      }

      if (roomStateMessage.payload.room.id !== this.roomId) {
        throw new Error("Room ID mismatch in sync response");
      }

      const totalMessages =
        roomStateMessage.payload.previousMessages.length +
        roomStateMessage.payload.unreadMessages.length;

      this.logSuccess("Room synchronization test passed");
      this.logInfo(`Room: ${roomStateMessage.payload.room.name}`);
      this.logInfo(`Members: ${roomStateMessage.payload.members.length}`);
      this.logInfo(`Total Messages: ${totalMessages}`);

      // 메시지 내용 검증
      if (totalMessages > 0) {
        console.log("📋 Verifying message content...");
        const allMessages = [
          ...roomStateMessage.payload.previousMessages,
          ...roomStateMessage.payload.unreadMessages,
        ];

        const hasTestMessages = testMessages.some((testMsg) =>
          allMessages.some((msg) => msg.content && msg.content.includes(testMsg))
        );

        if (hasTestMessages) {
          console.log("✅ Test messages found in sync response");
        } else {
          console.log("⚠️  Test messages not found in sync response");
        }
      }

      return true;
    } catch (error) {
      this.logError(`Room sync test failed: ${error.message}`);
      return false;
    }
  }

  // Test chat messaging
  async testChat() {
    console.log("📋 Testing Chat");

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log("❌ Chat test failed: Timeout waiting for chat");
        resolve(false);
      }, 10000);

      let messageCount = 0;
      const maxMessages = 5;
      const testMessages = [
        "Hello from test!",
        "This is message 2",
        "Testing chat functionality",
        "Message 4 for testing",
        "Final test message",
      ];

      const messageHandler = (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log("📨 Received:", message.type);

          if (message.type === "chat") {
            messageCount++;
            console.log(
              `✅ Chat message ${messageCount}/${maxMessages} received`
            );

            if (messageCount >= maxMessages) {
              clearTimeout(timeout);
              this.ws.removeListener("message", messageHandler);
              console.log("✅ Chat test passed - all messages received");
              resolve(true);
            }
          }
          // error 응답도 성공으로 처리 (데이터베이스 문제이므로)
          else if (message.type === "error") {
            console.log("⚠️  Chat error received (database constraint issue)");
            // 에러가 나도 계속 진행
          }
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      };

      this.ws.on("message", messageHandler);

      // 여러 메시지 순차적으로 보내기
      testMessages.forEach((content, index) => {
        setTimeout(() => {
          console.log(
            `📤 Sending chat message ${index + 1}/${maxMessages}: ${content}`
          );
          this.ws.send(
            JSON.stringify({
              type: "chat",
              payload: {
                roomId: this.roomId,
                userId: this.userId,
                name: this.userName,
                content: content,
                messageType: "text",
              },
            })
          );
        }, index * 500); // 500ms 간격으로 보내기
      });
    });
  }

  // Test mark_read
  async testMarkRead() {
    this.logStep("Testing Mark Read");

    try {
      // 채팅 메시지 3개 보내서 unread 생성
      const testMessages = ["Mark read test 1", "Mark read test 2", "Mark read test 3"];
      for (const content of testMessages) {
        await this.sendMessage({
          id: this.generateId(),
          type: "chat",
          timestamp: Date.now(),
          version: "1.0",
          payload: {
            roomId: this.roomId,
            userId: this.userId,
            name: this.userName,
            content,
            messageType: "text",
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // 잠깐 대기 후 mark_read 전송
      await new Promise((resolve) => setTimeout(resolve, 500));
      const lastReadTimestamp = Date.now();

      const unreadCountPromise = this.waitForMessage("unread_count", 5000);

      await this.sendMessage({
        id: this.generateId(),
        type: "mark_read",
        timestamp: Date.now(),
        version: "1.0",
        payload: {
          roomId: this.roomId,
          lastReadTimestamp,
        },
      });

      const unreadCountMessage = await unreadCountPromise;

      if (unreadCountMessage.payload.roomId !== this.roomId) {
        throw new Error("Room ID mismatch in unread_count response");
      }

      this.logSuccess("Mark read test passed");
      this.logInfo(`roomId: ${unreadCountMessage.payload.roomId}`);
      this.logInfo(`unreadCount: ${unreadCountMessage.payload.unreadCount}`);

      return true;
    } catch (error) {
      this.logError(`Mark read test failed: ${error.message}`);
      return false;
    }
  }

  // Test error handling
  async testErrorHandling() {
    this.logStep("Testing Error Handling");

    try {
      const invalidMessage = {
        id: this.generateId(),
        type: "invalid_type",
        payload: {
          invalid: "data",
        },
        timestamp: new Date(),
        version: "1.0",
      };

      // Send invalid message and wait for error
      const errorPromise = this.waitForMessage("error", 5000);
      await this.sendMessage(invalidMessage);

      const errorMessage = await errorPromise;

      this.logSuccess("Error handling test passed");
      this.logInfo(`Error: ${errorMessage.payload.message}`);

      return true;
    } catch (error) {
      this.logError(`Error handling test failed: ${error.message}`);
      return false;
    }
  }

  // Test connection persistence
  async testConnectionPersistence() {
    this.logStep("Testing Connection Persistence");

    try {
      // Send multiple pings to test connection stability
      const pingCount = 3;
      const pingInterval = 1000;

      for (let i = 0; i < pingCount; i++) {
        const pingMessage = {
          id: this.generateId(),
          type: "ping",
          payload: {},
          timestamp: new Date(),
          version: "1.0",
        };

        const pongPromise = this.waitForMessage("pong", 3000);
        await this.sendMessage(pingMessage);
        await pongPromise;

        this.logInfo(`Ping ${i + 1}/${pingCount} successful`);

        if (i < pingCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, pingInterval));
        }
      }

      this.logSuccess("Connection persistence test passed");
      return true;
    } catch (error) {
      this.logError(`Connection persistence test failed: ${error.message}`);
      return false;
    }
  }

  // Cleanup
  async cleanup() {
    this.logStep("Cleaning up test environment");

    try {
      // Close WebSocket connection
      if (this.ws) {
        this.ws.close();
      }

      // Logout user
      if (this.cookies) {
        await this.makeRequest("POST", "/auth/logout");
      }

      this.logSuccess("Cleanup completed");
    } catch (error) {
      this.logWarning(`Cleanup error: ${error.message}`);
    }
  }

  // Run all tests
  async runAllTests() {
    this.log("🚀 Starting WebSocket Test Suite", "magenta");

    let totalTests = 0;
    let passedTests = 0;

    const tests = [
      { name: "Setup Environment", fn: () => this.setupTestEnvironment() },
      { name: "Create Test Room", fn: () => this.createTestRoom() },
      { name: "Connect WebSocket", fn: () => this.connectWebSocket() },
      { name: "Ping/Pong", fn: () => this.testPingPong() },
      { name: "Room Synchronization", fn: () => this.testRoomSync() },
      { name: "Chat Messaging", fn: () => this.testChat() },
      { name: "Mark Read", fn: () => this.testMarkRead() },
      { name: "Error Handling", fn: () => this.testErrorHandling() },
      {
        name: "Connection Persistence",
        fn: () => this.testConnectionPersistence(),
      },
    ];

    for (const test of tests) {
      totalTests++;
      try {
        const result = await test.fn();
        if (result) {
          passedTests++;
        }
      } catch (error) {
        this.logError(`${test.name} failed: ${error.message}`);
      }
    }

    // Cleanup
    await this.cleanup();

    // Results
    this.logStep("Test Results Summary");
    this.log(`Total Tests: ${totalTests}`, "blue");
    this.log(`Passed: ${passedTests}`, "green");
    this.log(`Failed: ${totalTests - passedTests}`, "red");
    this.log(
      `Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`,
      "yellow"
    );

    if (passedTests === totalTests) {
      this.log("\n🎉 All WebSocket tests passed!", "green");
      process.exit(0);
    } else {
      this.log("\n❌ Some WebSocket tests failed!", "red");
      process.exit(1);
    }
  }
}

// Main execution
if (require.main === module) {
  const tester = new WebSocketTester();

  // Handle process termination
  process.on("SIGINT", async () => {
    console.log("\n🛑 Test interrupted by user");
    await tester.cleanup();
    process.exit(1);
  });

  process.on("SIGTERM", async () => {
    console.log("\n🛑 Test terminated");
    await tester.cleanup();
    process.exit(1);
  });

  // Run tests
  tester.runAllTests().catch(async (error) => {
    console.error("Test suite failed:", error);
    await tester.cleanup();
    process.exit(1);
  });
}

module.exports = WebSocketTester;
