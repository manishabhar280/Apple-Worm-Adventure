export function createAdminController(adminService, rewardService) {
  return {
    async getDashboard(_request, response) {
      response.json(await adminService.getDashboard());
    },

    async getRewardConfigurations(_request, response) {
      response.json(await rewardService.getConfiguration());
    },

    async updateRewardConfiguration(request, response) {
      response.json(await adminService.updateRewardConfiguration(
        request.user,
        request.params.rewardType,
        request.body,
      ));
    },
  };
}
