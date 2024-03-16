export interface Token {
  symbol: string;
  address: string;
}
export type SmartAccount = {
  address: string;
  feeToken: Token;
  listTokenApproved: Token[];
};

export interface TokenPaymasterUser {
  smartAccountsOwner: string;
  smartAccounts: SmartAccount[];
}
