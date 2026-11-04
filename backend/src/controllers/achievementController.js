export function createAchievementController(achievementService) {
  return {
    async getAchievements(request, response) {
      response.json({
        achievements: await achievementService.updateProgress(request.user),
      });
    },
  };
}
