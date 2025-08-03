import { Channel } from 'amqplib';
import { QUEUING } from 'src/rabbitmq.events';

export const setupQueuesAndExchanges = async (channel: Channel) => {
  // 1. Declare Exchanges
  await channel.assertExchange(QUEUING.EXCHANGES.BID_X, 'topic', {
    durable: true,
  });
  await channel.assertExchange( 
    QUEUING.EXCHANGES.BID_HASH_X,
    'x-consistent-hash',
    {
      durable: true,
    },
  );
  await channel.assertExchange(QUEUING.EXCHANGES.AUDIT_FANOUT_X, 'fanout', {
    durable: true,
  });
  await channel.assertExchange(QUEUING.EXCHANGES.NOTIF_X, 'direct', {
    durable: true,
  });

  // 2. Declare Bid-Processing Queues and bind with consistent hash key
  const bidProcessingQueueCount = 3; // TODO: config driven
  for (let i = 1; i <= bidProcessingQueueCount; i++) {
    const bidQueueName = `${QUEUING.QUEUES.BID_PROCESSING_PREFIX}${i}`;
    await channel.assertQueue(bidQueueName, { durable: true });
    await channel.bindQueue(bidQueueName, QUEUING.EXCHANGES.BID_X, '1'); // weight=1
  }

  // 3. Declare Audit Queue and bind to AUDIT_FANOUT_X
  await channel.assertQueue(QUEUING.QUEUES.AUDIT_LOG_Q, { durable: true });
  await channel.bindQueue(
    QUEUING.QUEUES.AUDIT_LOG_Q,
    QUEUING.EXCHANGES.AUDIT_FANOUT_X,
    '',
  );

  // 4. Bind Exchanges: BID_X → AUDIT_FANOUT_X (duplicate flow)
  await channel.bindExchange(
    QUEUING.EXCHANGES.AUDIT_FANOUT_X,
    QUEUING.EXCHANGES.BID_X,
    '#',
  );
  await channel.bindExchange(
    QUEUING.EXCHANGES.BID_HASH_X,
    QUEUING.EXCHANGES.BID_X,
    '#',
  );

  // 5. Declare Notification Queue and bind to NOTIF_X
  await channel.assertQueue(QUEUING.QUEUES.NOTIF_Q, { durable: true });
  await channel.bindQueue(
    QUEUING.QUEUES.NOTIF_Q,
    QUEUING.EXCHANGES.NOTIF_X,
    'notification',
  );
  await channel.bindExchange(
    QUEUING.EXCHANGES.AUDIT_FANOUT_X,
    QUEUING.EXCHANGES.NOTIF_X,
    '',
  );
};
