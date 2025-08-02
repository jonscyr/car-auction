import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
// import { Socket } from 'socket.io';
import { AuctionService } from '../auction.service';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class AuctionIsActiveGuard implements CanActivate {
  private readonly logger = new Logger(AuctionIsActiveGuard.name);
  constructor(private readonly auctionService: AuctionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // const client = context.switchToWs().getClient<Socket>();
    const data = context.switchToWs().getData();
    if (!data.auctionId)
      throw new WsException({
        status: 'error',
        message: 'auctionId required',
      });
    const auction = await this.auctionService.getAuctionById(data.auctionId);

    if (!auction)
      throw new WsException({
        status: 'error',
        message: 'Auction not found',
      });
    return true;
  }
}
