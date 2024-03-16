import { Schema } from 'mongoose';
import { dexDB } from '../../db';
import { TotalVolume } from '../types/total-volume';

const TotalVolumeSchema = new Schema<TotalVolume>({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
  totalBuy: {
    type: Number,
    required: true,
    default: 0,
  },
  totalSell: {
    type: Number,
    required: true,
    default: 0,
  },
}).index({ telegramId: 1 });

const TotalVolumeModel = dexDB.model('TotalVolume', TotalVolumeSchema);

export default TotalVolumeModel;
