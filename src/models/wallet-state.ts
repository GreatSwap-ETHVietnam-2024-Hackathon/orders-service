import { Schema } from 'mongoose';
import { WalletState } from '../types/wallet-state';
import { limitOrdersDB } from '../../db';

const TxLastestSchema = new Schema<WalletState>({
  address: {
    type: String,
    required: true,
    unique: true,
  },
  isRunning: {
    type: Boolean,
    required: true,
  },
}).index({ address: 1 });

const WalletStateModel = limitOrdersDB.model('WalletState', TxLastestSchema);

export default WalletStateModel;
