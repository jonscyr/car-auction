import { Module } from '@nestjs/common';
import { BidService } from './bidding.service';

@Module({
  providers: [BidService],
  exports: [BidService],
})
export class BidModule {}
