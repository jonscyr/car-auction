import { Module } from '@nestjs/common';
import { AuctionGateway } from './auction.gateway';
import { AuctionService } from './auction.service';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [CommonModule],
  providers: [AuctionGateway, AuctionService],
  exports: [AuctionGateway],
})
export class AuctionModule {}
