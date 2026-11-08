
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import Wallet from "../../src/models/Wallet.js";
import WalletTransaction from "../../src/models/WalletTransaction.js";
import { createWalletService } from "../../src/services/walletService.js";
import {
  createIntegrationContext,
  databaseTestSkipReason,
} from "./mongoTestSupport.js";

test("rolls back wallet debit, booster inventory and transaction after purchase failure", {
  skip: databaseTestSkipReason,
}, async (t) => {
  const context = await createIntegrationContext({
    databaseSuffix: "walletrollback",
  });
  t.after(context.close);

  const account = await context.register("Wallet Rollback Player");
  const userId = account.body.user.id;

  await Wallet.create({
    user: userId,
    balance: 20,
    currency: "COIN",
  });

  const failingWalletModel = {
    findOne: (...args) => Wallet.findOne(...args),

    findOneAndUpdate(filter, update, options) {
      const query = Wallet.findOneAndUpdate(filter, update, options);

      const isInventoryUpdate =
        update?.$inc &&
        Object.keys(update.$inc).some((key) =>
          key.startsWith("boosterInventory."),
        );

      if (!isInventoryUpdate) return query;

      return query.then((wallet) => {
        if (!wallet) return wallet;
        throw new Error("Injected failure after booster inventory update");
      });
    },
  };

  const walletService = createWalletService({
    WalletModel: failingWalletModel,
  });

  await assert.rejects(
    walletService.purchaseBooster(
      { _id: userId },
      "undo",
      randomUUID(),
    ),
    /Injected failure after booster inventory update/,
  );

  const walletAfterFailure = await Wallet.findOne({ user: userId });
  const transactionsAfterFailure = await WalletTransaction.find({
    user: userId,
  });

  assert.equal(walletAfterFailure.balance, 20);
  assert.equal(walletAfterFailure.boosterInventory.undo, 0);
  assert.equal(transactionsAfterFailure.length, 0);
});
