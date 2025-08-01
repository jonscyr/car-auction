import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, ChannelModel, connect } from 'amqplib';

@Injectable()
export class RabbitMQProducer {
  private connection: ChannelModel;
  private channel: Channel;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const rabbitMQUrl = this.configService.get<string>('RABBITMQ_URL');
    if (!rabbitMQUrl) {
      throw new Error('RABBITMQ_URL is not defined in environment variables');
    }

    this.connection = await connect(rabbitMQUrl);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange('auction.exchange', 'direct', {
      durable: true,
    });
  }

  async publishToQueue(queue: string, message: any) {
    await this.channel.assertQueue(queue, { durable: true });
    this.channel.publish(
      'auction.exchange',
      queue,
      Buffer.from(JSON.stringify(message)),
    );
  }
}
