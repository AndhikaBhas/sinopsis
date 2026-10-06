import amqp from "amqplib";

export async function publishToQueue(exchange: string, queue: string, message: any) {
  let connection;
  let channel;

  try {
    // Get RabbitMQ URL from environment variables
    const rabbitmqUrl =
      process.env.RABBITMQ_URL ??
      process.env.RABBIT_MQ_URL ??
      "amqp://kurikulum_dev:kurikulum_dev13@10.252.178.62:5672/";

    connection = await amqp.connect(rabbitmqUrl);
    channel = await connection.createChannel();

    // Ensure exchange exists (declare it)
    await channel.assertExchange(exchange, "direct", { durable: true });

    // Ensure queue exists (declare it)
    await channel.assertQueue(queue, { durable: true });

    // Bind queue to exchange
    await channel.bindQueue(queue, exchange, queue);

    // Publish message to queue via exchange
    const messageBuffer = Buffer.from(JSON.stringify(message));
    const published = channel.publish(exchange, queue, messageBuffer, { persistent: true });

    if (!published) {
      throw new Error("Failed to publish message - channel buffer full");
    }

    return { success: true };
  } catch (error) {
    console.error("RabbitMQ publish error:", error);
    return { success: false, error: (error as Error).message };
  } finally {
    // Clean up connections
    if (channel) {
      try {
        await channel.close();
      } catch {
        // Connection cleanup errors are not critical
      }
    }

    if (connection) {
      try {
        await connection.close();
      } catch {
        // Connection cleanup errors are not critical
      }
    }
  }
}
