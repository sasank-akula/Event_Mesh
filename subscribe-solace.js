
import "dotenv/config";
import mqtt from "mqtt";

const client = mqtt.connect(
  `mqtts://${process.env.SOLACE_HOST}:${process.env.SOLACE_PORT}`,
  {
    username: process.env.SOLACE_USERNAME,
    password: process.env.SOLACE_PASSWORD,
    clientId: `cap-orders-subscriber-${Date.now()}`,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 0
  }
);

client.on("connect", () => {
  console.log("Connected to Solace!");

  client.subscribe(
    process.env.SOLACE_TOPIC,
    { qos: 1 },
    (error) => {
      if (error) {
        console.error("Subscription failed:", error.message);
        client.end();
        return;
      }

      console.log(
        `Subscribed to topic: ${process.env.SOLACE_TOPIC}`
      );
      console.log("Waiting for messages...");
    }
  );
});

client.on("message", (topic, payload) => {
  console.log("Message received!");
  console.log("Topic:", topic);
  console.log("Payload:", payload.toString());
});

client.on("error", (error) => {
  console.error("MQTT error:", error.message);
  client.end();
});
