import { Schema } from 'mongoose';
import {
  SmartAccount,
  Token,
  TokenPaymasterUser,
} from '../types/token-paymaster-user';
import { telegramDB } from '../../db';

export const TokenSchema = new Schema<Token>({
  symbol: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
});

export const ethToken: Token = {
  symbol: 'ETH',
  address: '0x',
};

const SmartAccountSchema = new Schema<SmartAccount>({
  address: {
    type: String,
    required: true,
  },
  feeToken: {
    type: TokenSchema,
    default: ethToken,
  },
  listTokenApproved: {
    type: [TokenSchema],
    default: [ethToken],
  },
});

const TokenPaymasterUserSchema = new Schema<TokenPaymasterUser>({
  smartAccountsOwner: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },
  smartAccounts: {
    type: [SmartAccountSchema],
    required: true,
    default: [],
  },
});

export const TokenPaymasterUserModel = telegramDB.model(
  'Token-Paymaster-User',
  TokenPaymasterUserSchema,
);
