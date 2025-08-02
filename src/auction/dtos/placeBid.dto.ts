import { IsString, IsNotEmpty } from 'class-validator';

export class PlaceBidDto {
  @IsString()
  @IsNotEmpty()
  auctionId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  bidAmount: number;
}
