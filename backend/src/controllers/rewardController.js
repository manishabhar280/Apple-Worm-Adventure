export function createRewardController(rewardService) {
  return {
    async getConfiguration(_request, response) {
      response.json(await rewardService.getConfiguration());
    },

    async startReward(request, response) {
      response.status(201).json(
        await rewardService.startReward(request.user, request.body),
      );
    },

    async verifyReward(request, response) {
      response.json(
        await rewardService.verifyReward(request.user, request.params.sessionId),
      );
    },

    async getHistory(request, response) {
      response.json({
        rewards: await rewardService.getHistory(request.user, {
          limit: request.query.limit,
          page: request.query.page,
        }),
      });
    },
  };
}
