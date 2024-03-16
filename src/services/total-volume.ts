import TotalVolumeModel from '../models/total-volume';

export async function updateTotalBuyVolume(telegramId: number, volume: number) {
  try {
    let totalVolume = await TotalVolumeModel.findOne({
      telegramId,
    });

    if (!totalVolume) {
      totalVolume = await TotalVolumeModel.create({
        telegramId,
        totalBuy: volume,
        totalSell: 0,
      });
    } else {
      totalVolume.totalBuy += volume;
      await totalVolume.save();
    }

    return totalVolume;
  } catch (error) {
    throw new Error(
      `An error occurred while updating the total purchase quantity: ${error}`,
    );
  }
}

export async function updateTotalSellVolume(
  telegramId: number,
  volume: number,
) {
  try {
    let totalVolume = await TotalVolumeModel.findOne({ telegramId });

    if (!totalVolume) {
      totalVolume = await TotalVolumeModel.create({
        telegramId,
        totalBuy: 0,
        totalSell: volume,
      });
    } else {
      totalVolume.totalSell += volume;
      await totalVolume.save();
    }

    return totalVolume;
  } catch (error) {
    throw new Error(
      `An error occurred while updating the total sales quantity: ${error}`,
    );
  }
}
