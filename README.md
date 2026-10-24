# Event Mesh: CAP Node.js + Solace Cloud MQTT

This project is a learning/demo setup for connecting a Node.js project
with a Solace Cloud broker using MQTT over TLS.

## What has been completed

-   Created a Solace Cloud Developer service.
-   Enabled secure MQTT access on port `8883`.
-   Retrieved the broker hostname and client username from Solace Cloud.
-   Configured local environment variables in `.env`.
-   Installed the Node.js packages `mqtt` and `dotenv`.
-   Connected to Solace successfully using MQTT.js.
-   Published a test `OrderCreated` message to `demo/orders/created`.
-   Subscribed to the same topic from a separate Node.js process and
    received the test message.

**Scope note:** The standalone MQTT publish/subscribe test works.
Publishing automatically from a CAP order-creation handler has not yet
been integrated in this demo.

------------------------------------------------------------------------

## 1. Solace Cloud setup

### Step 1: Create a Solace service

1.  Sign in to the Solace Cloud Console.
2.  Create a messaging service using the Developer service plan.
3.  Select the desired cloud provider and region.
4.  Wait until the service status is **Running**.
5.  Open the service and note the Message VPN/service details.

The service used during this demo was named `cap-orders-demo`. Your own
service may have a different name.

### Step 2: Enable and locate MQTT connection details

1.  Open the service's **Connect** panel.
2.  Choose the JavaScript / MQTT connection option, or the MQTT
    connection details provided by the console.
3.  Select the secure MQTT connection.
4.  Record the broker hostname and port.
5.  Open **Access Control → Client Usernames** and identify an enabled
    client username and its associated password.

For this demo, the secure MQTT port was `8883`. The connection URI
displayed by the console used the `ssl://` scheme for its example
client. For MQTT.js in Node.js, use the equivalent `mqtts://` scheme.

Example hostname format:

``` text
mr-connection-xxxxxxxx.messaging.solace.cloud
```

Use the exact hostname shown for your own service; do not copy the
example hostname unless it matches your service.

### Where to get the credentials

  -----------------------------------------------------------------------
  Environment variable                Where to get it
  ----------------------------------- -----------------------------------
  `SOLACE_HOST`                       Solace Cloud service **Connect**
                                      panel; hostname only, without
                                      `mqtts://`

  `SOLACE_PORT`                       Secure MQTT connection details;
                                      this demo uses `8883`

  `SOLACE_USERNAME`                   Solace Cloud **Access Control →
                                      Client Usernames**, or the username
                                      shown in the connection
                                      instructions

  `SOLACE_PASSWORD`                   Password for that client username,
                                      as configured or generated in
                                      Solace Cloud

  `SOLACE_TOPIC`                      Chosen by the application; this
                                      demo uses `demo/orders/created`
  -----------------------------------------------------------------------

Keep credentials private. Never commit `.env` or paste its contents into
public issues, screenshots, or chat messages. If credentials have been
pushed to a public or shared Git repository, rotate them in Solace
Cloud; deleting the file alone does not invalidate the exposed
credentials.

------------------------------------------------------------------------

## 2. CAP / Node.js project setup

### Step 1: Open the project

Run commands from the root directory of your CAP project (the directory
containing `package.json`).

### Step 2: Install the MQTT and environment-variable packages

``` bash
npm install mqtt dotenv
```

-   `mqtt`: MQTT client for Node.js.
-   `dotenv`: loads local variables from `.env` into `process.env`.

The project uses ES modules (`"type": "module"` in `package.json`), so
use `import` rather than CommonJS `require()` in these scripts.

### Step 3: Create `.env`

Create a file named `.env` in the project root and populate it with your
own Solace connection values:

``` dotenv
SOLACE_HOST=your-solace-host.messaging.solace.cloud
SOLACE_PORT=8883
SOLACE_USERNAME=your-client-username
SOLACE_PASSWORD=your-client-password
SOLACE_TOPIC=demo/orders/created
```

Do not put quotes around the values unless your value specifically
requires them. Replace every placeholder with the values from your own
Solace Cloud service.

### Step 4: Add `.env` to `.gitignore`

Ensure the project root `.gitignore` contains:

``` gitignore
.env
.env.*
!.env.example
node_modules/
```

This keeps secrets out of Git while allowing the safe template
`.env.example` to be committed.

------------------------------------------------------------------------

## 3. Test the connection and publish a message

Create `test-solace.js` in the project root:

``` js
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
```

Run:

``` bash
node test-solace.js
```

Expected output:

``` text
Connected to Solace successfully!
Test event published successfully.
```

This confirms the connection and that the broker accepted the publish.
To confirm end-to-end delivery, run the subscriber below at the same
time.

------------------------------------------------------------------------

## 4. Subscribe and receive messages

Create `subscribe-solace.js` in the project root:

``` js
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

      console.log(`Subscribed to topic: ${process.env.SOLACE_TOPIC}`);
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
```

### Run the end-to-end test

1.  Open terminal 1 and run:

    ``` bash
    node subscribe-solace.js
    ```

2.  Wait until it prints `Waiting for messages...`.

3.  Open terminal 2 in the same project directory and run:

    ``` bash
    node test-solace.js
    ```

4.  Terminal 1 should display a message similar to:

    ``` text
    Message received!
    Topic: demo/orders/created
    Payload: {"event":"OrderCreated","orderId":"TEST-001","amount":1500}
    ```

The subscriber must be running before the test message is published for
this simple demo. The scripts use clean MQTT sessions and do not provide
offline message storage.

------------------------------------------------------------------------

## 5. Understanding the flow

``` text
test-solace.js (publisher)
        |
        | MQTT over TLS (port 8883)
        v
Solace Cloud broker
        |
        | Topic: demo/orders/created
        v
subscribe-solace.js (subscriber)
```

-   **MQTT** is the messaging protocol used by the client and broker.
-   **TLS** protects the connection in transit.
-   **Topic** is a string attached to the published message and used by
    subscribers to express what they want to receive. You do not need to
    create a topic object in advance for this basic example.
-   **QoS 1** requests at-least-once MQTT delivery, so applications
    should be prepared for duplicate messages.
-   MQTT publish acknowledgement confirms protocol-level handling; it
    does not prove that downstream business processing completed
    successfully.

------------------------------------------------------------------------

## 6. How this relates to CAP

The publisher and subscriber scripts currently run independently of
CAP's service handlers. The next integration step is to publish an
`OrderCreated` event from the CAP handler after an order is successfully
persisted.

For production, consider transaction consistency (for example, an outbox
pattern), reconnection handling, duplicate processing, observability,
and an appropriate broker-side queue/durability design.

CAP Messaging is another option, but confirm that the selected CAP
messaging backend or plugin supports your specific Solace service and
protocol. Do not assume the SAP Event Mesh `enterprise-messaging`
configuration automatically works with a standalone Solace Cloud MQTT
endpoint.

------------------------------------------------------------------------

## 7. Troubleshooting

-   **Missing configuration:** Check that `.env` is in the project root
    and that all required variables are present.
-   **Authentication failure:** Verify the client username and password
    in Solace Cloud.
-   **Connection failure:** Verify the hostname, secure MQTT port
    `8883`, network access, and service status.
-   **No message received:** Start the subscriber first, check that
    publisher and subscriber use exactly the same topic, and then
    publish again.
-   **`.env` appeared in Git:** Add it to `.gitignore`, remove it from
    tracking, and rotate any exposed credentials. If it was already
    pushed, removing the file in a later commit does not remove it from
    earlier history.

------------------------------------------------------------------------

## 8. Safe environment template (`.env.example`)

Commit this template to Git. Copy it to `.env` locally and replace the
placeholders with your own values. Never put real credentials in this
file.

``` dotenv
SOLACE_HOST=your-solace-host.messaging.solace.cloud
SOLACE_PORT=8883
SOLACE_USERNAME=your-client-username
SOLACE_PASSWORD=replace-with-your-client-password
SOLACE_TOPIC=demo/orders/created
```
