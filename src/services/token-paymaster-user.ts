import { TokenPaymasterUserModel } from '../models/token-paymaster-user';
import { Token } from '../types/token-paymaster-user';

export async function getTokenPaymaster(
  smartAccountsOwner: string,
  smartAccountAddress: string,
) {
  const tokenFee = await getTokenFees(smartAccountsOwner, [
    smartAccountAddress,
  ]);

  return tokenFee[0].feeToken.address;
}

export async function getTokenFees(
  smartAccountsOwner: string,
  smartAccountAddress: string[],
) {
  const smartAccounts = await TokenPaymasterUserModel.findOne({
    smartAccountsOwner,
  });
  if (!smartAccounts)
    return smartAccountAddress.map((smartAccount) => ({
      smartAccount,
      feeToken: { symbol: 'ETH', address: '0x' } as Token,
      listTokenApprove: [{ symbol: 'ETH', address: '0x' } as Token],
    }));

  return smartAccountAddress.map((smartAccount) => {
    const foundAccount = smartAccounts.smartAccounts.find(
      (a) => a.address == smartAccount,
    );
    if (foundAccount) {
      return {
        smartAccount,
        feeToken: foundAccount.feeToken,
        listTokenApprove: foundAccount.listTokenApproved,
      };
    } else {
      return {
        smartAccount,
        feeToken: { symbol: 'ETH', address: '0x' } as Token,
        listTokenApprove: [{ symbol: 'ETH', address: '0x' } as Token],
      };
    }
  });
}
