import { Module } from '@nestjs/common';
import { BidService } from './bidding.service';
import { CommonModule } from 'src/common/common.module';
import { AuctionService } from 'src/auction/auction.service';

@Module({
  providers: [BidService, AuctionService],
  exports: [BidService],
  imports: [CommonModule],
})
export class BidModule {}
