## Assumptions

1. The system will not allow a user to use multiple clients concurrently.
2. The auth mechanisms and apis for auction and user managements are already present.

## Notes
1. exchanges and queues.
    - ![Alt text](https://raw.githubusercontent.com/jonscyr/car-auction/refs/heads/main/exchange%20setup.png)
2. This app can do two jobs
    1. The gateway for accepting requests.
    2. the consumer for processing bids.
        - The consumer will be running only if the instance is given a CONSUMER_QUEUE_ID = 1 [,2,3].
        - we can separate this into a new service if needed.
3. We use consistent hash exchange for parallelly processing multiple bids from auctions. The number of consumers can scale up easily. 