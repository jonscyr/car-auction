import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create Users
  await prisma.user.createMany({
    data: [
      {
        id: 'user1',
        username: 'john_doe',
        email: 'john@example.com',
      },
      {
        id: 'user2',
        username: 'jane_smith',
        email: 'jane@example.com',
      },
      {
        id: 'user3',
        username: 'candy_john',
        email: 'candy@example.com',
      },
    ],
  });

  // Create Auction
  await prisma.auction.createMany({
    data: [
      {
        id: 'auction1',
        carId: 'car123',
        startTime: new Date(Date.now() - 1000 * 60 * 10), // started 10 mins ago
        endTime: new Date(Date.now() + 1000 * 60 * 20), // ends in 20 mins
        startingBid: 5000,
        currentHighestBid: 5000,
        winnerId: null,
        status: 'ONGOING',
      },
      {
        id: 'auction2',
        carId: 'car124',
        startTime: new Date(Date.now() - 1000 * 60 * 20), // started 20 mins ago
        endTime: new Date(Date.now() + 1000 * 60 * 10), // ends in 10 mins
        startingBid: 5000,
        currentHighestBid: 5000,
        winnerId: null,
        status: 'ONGOING',
      },
      {
        id: 'auction3',
        carId: 'car125',
        startTime: new Date(Date.now() + 1000 * 60 * 10), // starts in 10 mins
        endTime: new Date(Date.now() + 1000 * 60 * 30), // ends in 30 mins
        startingBid: 5000,
        currentHighestBid: 5000,
        winnerId: null,
        status: 'PENDING',
      },
      {
        id: 'auction4',
        carId: 'car115',
        startTime: new Date(Date.now() - 1000 * 60 * 30), // started 30 mins ago
        endTime: new Date(Date.now() - 1000 * 10 * 30), // ended in 10 mins
        startingBid: 5000,
        currentHighestBid: 5000,
        winnerId: null,
        status: 'PENDING',
      },
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
