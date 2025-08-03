import { Channel } from 'amqplib';
import { QUEUING } from 'src/rabbitmq.events';

export const setupQueuesAndExchanges = async (
  channel: Channel,
  bidProcessingQueueCount: number,
) => {
  /**
   * --------------------------------------------------------
   * 1. Declare Exchanges
   * --------------------------------------------------------
   */

  // Entry exchange for all bid events (producers publish here)
  await channel.assertExchange(QUEUING.EXCHANGES.BID_X, 'topic', {
    durable: true,
  });

  // Consistent Hash Exchange for load balancing bid-processing queues
  await channel.assertExchange(
    QUEUING.EXCHANGES.BID_HASH_X,
    'x-consistent-hash',
    {
      durable: true,
    },
  );

  // Fanout exchange for audit logs (receives copy of every bid event)
  await channel.assertExchange(QUEUING.EXCHANGES.AUDIT_FANOUT_X, 'fanout', {
    durable: true,
  });

  // Direct exchange for notifications (specific routing keys)
  await channel.assertExchange(QUEUING.EXCHANGES.NOTIF_X, 'direct', {
    durable: true,
  });

  // Dead Letter Exchange for failed bid-processing messages
  await channel.assertExchange(QUEUING.EXCHANGES.BID_PROCESSING_DLX, 'direct', {
    durable: true,
  });

  /**
   * --------------------------------------------------------
   * 2. Declare Bid-Processing Queues with Retry & DLQ
   * --------------------------------------------------------
   * TODO: Retry consumers are not yet implemented
   */
  const retryDelayMs = 500; // Retry delay in milliseconds. Keep this low.

  for (let i = 1; i <= bidProcessingQueueCount; i++) {
    const bidQueueName = `${QUEUING.QUEUES.BID_PROCESSING_PREFIX}${i}`;
    const retryQueueName = `${bidQueueName}.retry`;
    const dlqQueueName = `${bidQueueName}.dlq`;

    /**
     * 2.1 Declare DLQ Queue (final failure destination)
     */
    await channel.assertQueue(dlqQueueName, { durable: true });
    await channel.bindQueue(
      dlqQueueName,
      QUEUING.EXCHANGES.BID_PROCESSING_DLX,
      dlqQueueName,
    );

    /**
     * 2.2 Declare Retry Queue
     * - Messages failing in Main Queue will be published here for delayed retries.
     * - After TTL expiry, they are dead-lettered back to the Main Processing Queue.
     */
    await channel.assertQueue(retryQueueName, {
      durable: true,
      arguments: {
        'x-message-ttl': retryDelayMs, // Delay before retry
        'x-dead-letter-exchange': '', // Use default exchange to route back
        'x-dead-letter-routing-key': bidQueueName, // Route back to Main Queue
      },
    });

    /**
     * 2.3 Declare Main Processing Queue
     * - If message fails even after retries, it will be dead-lettered to DLQ.
     */
    await channel.assertQueue(bidQueueName, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': QUEUING.EXCHANGES.BID_PROCESSING_DLX, // DLX for ultimate failures
        'x-dead-letter-routing-key': dlqQueueName, // Route to DLQ Queue
      },
    });

    /**
     * 2.4 Bind Main Queue to Consistent Hash Exchange
     * - This allows bid-processing queues to scale horizontally.
     */
    await channel.bindQueue(bidQueueName, QUEUING.EXCHANGES.BID_X, '1'); // weight=1
  }

  /**
   * --------------------------------------------------------
   * 3. Declare Audit Queue (fanout binding)
   * --------------------------------------------------------
   */
  await channel.assertQueue(QUEUING.QUEUES.AUDIT_LOG_Q, { durable: true });
  await channel.bindQueue(
    QUEUING.QUEUES.AUDIT_LOG_Q,
    QUEUING.EXCHANGES.AUDIT_FANOUT_X,
    '',
  );

  /**
   * --------------------------------------------------------
   * 4. Bind Exchanges for Data Flow
   * --------------------------------------------------------
   */

  // Forward all messages from BID_X to AUDIT_FANOUT_X (broadcast for audit logs)
  await channel.bindExchange(
    QUEUING.EXCHANGES.AUDIT_FANOUT_X,
    QUEUING.EXCHANGES.BID_X,
    '#',
  );

  // Bind Consistent Hash Exchange under BID_X to receive messages (no routing key needed)
  await channel.bindExchange(
    QUEUING.EXCHANGES.BID_HASH_X,
    QUEUING.EXCHANGES.BID_X,
    '#',
  );

  /**
   * --------------------------------------------------------
   * 5. Declare Notification Queue (for event-driven notifications)
   * --------------------------------------------------------
   */
  await channel.assertQueue(QUEUING.QUEUES.NOTIF_Q, { durable: true });
  await channel.bindQueue(
    QUEUING.QUEUES.NOTIF_Q,
    QUEUING.EXCHANGES.NOTIF_X,
    'notification',
  );

  // Forward notification events into audit logs for tracking
  await channel.bindExchange(
    QUEUING.EXCHANGES.AUDIT_FANOUT_X,
    QUEUING.EXCHANGES.NOTIF_X,
    '',
  );
};
