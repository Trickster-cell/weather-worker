const express = require("express");
const amqp = require("amqp-connection-manager");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 6001;

// Middleware to parse JSON requests
app.use(express.json());

// Set up email transport
const transporter = nodemailer.createTransport({
  service: "outlook",
  auth: {
    user: process.env.SENDER_EMAIL,
    pass: process.env.SENDER_PASSWORD,
  },
});

// Function to send alert emails
const sendAlertEmail = async (
  city,
  temperature,
  humidity,
  wind_speed,
  condition,
  user_email
) => {
  const mailOptions = {
    from: process.env.SENDER_EMAIL,
    to: user_email,
    subject: `Weather Alert for ${city}`,
    text: `Dear User,\n\nWe wanted to inform you about the current weather conditions in ${city}.\n\nHere are the details:\n\n- Temperature: ${temperature}°C\n- Humidity: ${humidity}%\n- Wind Speed: ${wind_speed} m/s\n- Weather Condition: ${condition}\n\nAlert: Based on your subscribed thresholds, the current weather data indicates that one or more of the values are outside your preset limits. Please take the necessary precautions, especially if the weather poses a risk to your safety or daily activities.\n\nWe recommend staying updated on local weather forecasts and considering adjustments to your plans accordingly.\n\nIf you have any questions or need further assistance, feel free to reach out.\n\nStay safe!\n\nBest Regards,\nWeather App`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Alert email sent to ${user_email}`);
  } catch (error) {
    console.error(`Failed to send alert email to ${user_email}:`, error);
  }
};

// Function to start the RabbitMQ worker
const startWorker = async () => {
  let connection;
  const maxRetries = 5;
  const retryDelay = 30000;

  const host = [process.env.RABBIT_MQ_URL] || [
    "amqp://localhost:5672",
    "amqp://localhost:5673",
    "amqp://localhost:5674",
  ];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      connection = await amqp.connect(host, "heartbeat=60");
      const channelWrapper = await connection.createChannel({
        json: true,
        setup: (channel) => channel.assertQueue("email_alerts", { durable: true }),
      });
      const queue = "email_alerts";

      console.log(`Waiting for messages in queue: ${queue}`);
      channelWrapper.addSetup((channel) =>
        channel.consume(queue, async (msg) => {
          if (msg !== null) {
            try {
              const message = JSON.parse(msg.content.toString());
              console.log(`Received message: ${JSON.stringify(message)}`);
              await sendAlertEmail(
                message.city,
                message.temperature,
                message.humidity,
                message.wind_speed,
                message.condition,
                message.user_email
              );
              channel.ack(msg);
              console.log("Message acknowledged");
            } catch (err) {
              console.error("Error processing message:", err);
            }
          }
        })
      );

      break; // Exit the retry loop if successful
    } catch (error) {
      console.error(`Error in worker (attempt ${attempt}):`, error);
      if (attempt < maxRetries) {
        console.log(`Retrying connection in ${retryDelay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        console.error("Max retries reached. Exiting worker...");
        process.exit(1);
      }
    } finally {
      gracefulShutdown(connection); // Handle connection close
    }
  }
};

// Graceful shutdown function
const gracefulShutdown = (connection) => {
  process.on("SIGINT", async () => {
    console.log("Gracefully shutting down worker...");
    if (connection) {
      await connection.close();
      console.log("RabbitMQ connection closed");
    }
    process.exit(0);
  });
};

// Define Express route
app.get("/", (req, res) => {
  res.send("Email Worker is running.");
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startWorker(); // Start the RabbitMQ worker
});
