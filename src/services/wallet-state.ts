import WalletStateModel from '../models/wallet-state';

export async function getStateWallet(address: string) {
  try {
    const data = await WalletStateModel.findOne({ address: address }).exec();
    return data?.isRunning!;
  } catch (error) {
    return false;
  }
}

export async function setStateWallet(address: any, state: boolean) {
  const currentTime = new Date();
  try {
    await WalletStateModel.updateOne(
      { address: address },
      { isRunning: state },
      { upsert: true },
    ).exec();
  } catch (error) {
    console.error('Error while setting TxLastest by TelegramId:', error);
  }
}
