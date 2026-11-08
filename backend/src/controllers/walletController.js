export function createWalletController(walletService) {
  return {
    async getBalance(request, response) {
      response.json(await walletService.getBalance(request.user));
    },

    async getTransactions(request, response) {
      response.json({
        transactions: await walletService.getTransactions(request.user, {
          limit: request.query.limit,
          page: request.query.page,
        }),
      });
    },

    async getBoosterInventory(request, response) {
      response.json(await walletService.getBoosterInventory(request.user));
    },

    async purchaseBooster(request, response) {
      response.json(await walletService.purchaseBooster(
        request.user,
        request.body.boosterId,
        request.body.requestId,
      ));
    },

    async purchaseHint(request, response) {
      response.json(await walletService.purchaseHint(request.user, request.body.requestId));
    },
  };
}
