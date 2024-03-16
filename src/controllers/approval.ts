import { keccak256 } from 'ethers/lib/utils';
import MerkleTree from 'merkletreejs';
import ApprovalModel from '../models/approval';
import { AddressZero } from '../config/constants';
import { calculateAllTokensLeaf, calculateTokenLeaf } from '../types/approval';
import ContractAddress, { SupportedRouters } from '../config/contracts';

export async function getApproval(
  telegramId: number,
  smartAccountsOwner: string,
) {
  const approval = await ApprovalModel.findOne({
    telegramId,
    smartAccountsOwner,
  });
  if (!approval) {
    throw new Error('No approval data found');
  }
  return approval;
}

export async function getMerkleProofs(
  telegramId: number,
  smartAccountsOwner: string,
  callingSmartAccounts: string[],
  sessionPublicKey: string,
  token: string,
  router: string,
) {
  const approval = await getApproval(telegramId, smartAccountsOwner);
  if (approval.locked) throw new Error('Account is locked');
  const { tokens, smartAccounts } = approval;
  let leaves: string[] = [];
  const routers = Object.values(SupportedRouters);
  let callingLeaves: string[];
  if (tokens.length === 1 && tokens[0] === AddressZero) {
    callingLeaves = callingSmartAccounts.map((smartAccount) =>
      calculateAllTokensLeaf(smartAccount, sessionPublicKey, router),
    );
    for (let j = 0; j < smartAccounts.length; j++) {
      const account = smartAccounts[j];
      for (let k = 0; k < routers.length; k++)
        leaves.push(
          calculateAllTokensLeaf(account, sessionPublicKey, routers[k]),
        );
    }
  } else {
    const index = tokens.indexOf(token);
    // if (index === -1) {
    //   throw new Error('Token not approved');
    // }
    callingLeaves = callingSmartAccounts.map((smartAccount) =>
      calculateTokenLeaf(smartAccount, sessionPublicKey, token, router),
    );
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      for (let j = 0; j < smartAccounts.length; j++) {
        const account = smartAccounts[j];
        for (let k = 0; k < routers.length; k++)
          leaves.push(
            calculateTokenLeaf(account, sessionPublicKey, token, routers[k]),
          );
      }
    }
  }

  for (let j = 0; j < smartAccounts.length; j++) {
    const smartAccount = smartAccounts[j];
    leaves.push(
      calculateTokenLeaf(
        smartAccount,
        sessionPublicKey,
        ContractAddress.WETH,
        SupportedRouters.PaymasterAddress,
      ),
    );
  }

  for (let j = 0; j < smartAccounts.length; j++) {
    const smartAccount = smartAccounts[j];
    leaves.push(
      calculateTokenLeaf(
        smartAccount,
        sessionPublicKey,
        ContractAddress.Cake,
        SupportedRouters.PaymasterAddress,
      ),
    );
  }

  const merkleTree = new MerkleTree(leaves, keccak256, {
    sortPairs: true,
    hashLeaves: false,
    sortLeaves: true,
  });

  return callingLeaves.map((leaf) => merkleTree.getHexProof(leaf));
}
