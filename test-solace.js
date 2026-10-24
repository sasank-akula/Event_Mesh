
import "dotenv/config";
import mqtt from "mqtt";

const {
  SOLACE_HOST,
  SOLACE_PORT,
  SOLACE_USERNAME,
  SOLACE_PASSWORD,
  SOLACE_TOPIC
} = process.env;

if (
  !SOLACE_HOST ||
  !SOLACE_PORT ||
  !SOLACE_USERNAME ||
  !SOLACE_PASSWORD ||
  !SOLACE_TOPIC
) {
  throw new Error("Missing required Solace configuration in .env");
}

const client = mqtt.connect(
  `mqtts://${SOLACE_HOST}:${SOLACE_PORT}`,
  {
    username: SOLACE_USERNAME,
    password: SOLACE_PASSWORD,
    clientId: `cap-orders-test-${Date.now()}`,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 0
  }
);

client.on("connect", () => {
  console.log("Connected to Solace successfully!");

  client.publish(
    SOLACE_TOPIC,
    JSON.stringify({
      event: "OrderCreated",
      orderId: "TEST-001",
      amount: 1500
    }),
    { qos: 1 },
    (error) => {
      if (error) {
        console.error("Publish failed:", error.message);
      } else {
        console.log("Test event published successfully.");
      }

      client.end();
    }
  );
});

client.on("error", (error) => {
  console.error("Solace connection error:", error.message);
  client.end();
});
