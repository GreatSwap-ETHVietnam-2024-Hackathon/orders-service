import TelegramSaltModel from "../models/salt";

export async function getSalt(telegramId: number) {
    const telegramSalt = await TelegramSaltModel.findOne({ telegramId })
    return telegramSalt ? telegramSalt.salt : 0
}