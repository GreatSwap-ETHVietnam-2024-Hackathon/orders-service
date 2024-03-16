import { BigNumberish } from 'ethers';
import { AddressZero } from '../../config/constants';
import ContractAddress, { SupportedRouters } from '../../config/contracts';
import { getSessionKey } from '../keys-generator/session-keys';
import { buildApprovalTx } from '../dexes/tx-builder';
import SessionKeyUserOpsBuilder from '../user-operations/builder';
import { UserOperation } from '../../types/user-operation';
import {
  executeOpsWithPrivRelayer,
  executeOpsWithPubRelayer,
} from '../relayers';
import { getMerkleProofs } from '../../controllers/approval';
import { getStateWallet, setStateWallet } from '../wallet-state';

export async function preApprove(
  telegramId: number,
  smartAccountsOwner: string,
  smartAccounts: string[],
  router: string,
  token: string,
  allowance: BigNumberish,
  usePrivRelayer: boolean = false,
) {
  let data = {};
  if (router == SupportedRouters.PaymasterAddress) {
    data = {
      smartAccountsOwner,
      smartAccounts,
      router,
      token,
      allowance,
    };
  }

  const sessionKey = await getSessionKey(telegramId);

  // if (token === AddressZero || token === ContractAddress.WETH) {
  //   throw new Error('Only accept non-native token');
  // }

  const merkleProofs = await getMerkleProofs(
    telegramId,
    smartAccountsOwner,
    smartAccounts,
    sessionKey.address,
    token,
    router,
  );

  const approveTx = buildApprovalTx(token, allowance, router);

  const ops: UserOperation[] = [];
  const opErrors: {
    [key: string]: string;
  } = {};
  const noOpErrors: string[] = [];
  const smartAccountsActive: string[] = [];
  for (let i = 0; i < smartAccounts.length; i++) {
    try {
      if (await getStateWallet(smartAccounts[i])) {
        throw new Error('Account is busy');
      } else {
        await setStateWallet(smartAccounts[i], true);
        smartAccountsActive.push(smartAccounts[i]);
      }
      const opBuilder = new SessionKeyUserOpsBuilder(
        smartAccounts[i],
        sessionKey,
      );
      const approveOp = await opBuilder
        .withPreApproveTx(approveTx)
        .withToken(token)
        .withRouter(router)
        .withMerkleProof(merkleProofs[i])
        .build();

      ops.push(approveOp);
      noOpErrors.push(smartAccounts[i]);
    } catch (err) {
      const err0 = (err as any).error?.error?.message;
      const err1 = (err as any).error?.message;
      const err2 = (err as Error).message;

      opErrors[smartAccounts[i]] = err0 ?? err1 ?? err2;
    }
  }
  try {
    if (ops.length > 0) {
      let txHash;

      if (!usePrivRelayer) txHash = await executeOpsWithPubRelayer(ops);
      else txHash = await executeOpsWithPrivRelayer(telegramId, ops);
      smartAccounts.map(async (address) => {
        await setStateWallet(address, false);
      });
      smartAccountsActive.map(async (address) => {
        await setStateWallet(address, false);
      });
      return {
        telegramId: telegramId,
        opErrors,
        noOpErrors,
        txHash,
        approvePaymaster: data,
      };
    } else {
      smartAccountsActive.map(async (address) => {
        await setStateWallet(address, false);
      });
      return {
        telegramId: telegramId,
        opErrors,
        approvePaymaster: data,
      };
    }
  } catch (err) {
    console.log('Data  =', data);
    console.log('route ', router);
    console.log('error', err);
    smartAccountsActive.map(async (address) => {
      await setStateWallet(address, false);
    });
    return {
      telegramId: telegramId,
      opErrors,
      noOpErrors,
      txError:
        (err as any).error?.error?.message ??
        (err as any).error?.message ??
        (err as Error).message,
      approvePaymaster: data,
    };
  }
}
