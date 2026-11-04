export function createPlayerController(playerService) {
  return {
    async getProgress(request, response) {
      response.json(await playerService.getProgress(request.user));
    },

    async startSession(request, response) {
      const result = await playerService.startSession(
        request.user,
        request.body.levelNumber,
      );
      response.status(201).json(result);
    },

    async saveSessionActions(request, response) {
      response.json(
        await playerService.saveSessionActions(
          request.user,
          request.params.sessionId,
          request.body.actions,
        ),
      );
    },

    async getDashboard(request, response) {
      response.json(await playerService.getDashboard(request.user));
    },

    async getHistory(request, response) {
      response.json({ history: await playerService.getHistory(request.user) });
    },

    async getLeaderboard(_request, response) {
      response.json({ players: await playerService.getLeaderboard() });
    },
  };
}
