describe('Telegram Bot Foundation Setup Tests', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('Config loading: loads config properties from environment', () => {
    const config = require('../src/config/config');
    expect(config).toHaveProperty('telegramToken');
    expect(config).toHaveProperty('telegramChatId');
    expect(typeof config.telegramToken).toBe('string');
    expect(typeof config.telegramChatId).toBe('string');
  });

  test('Bot module loading: exports expected functions and properties', () => {
    const botModule = require('../src/telegram/telegram.bot');
    expect(botModule).toBeDefined();
    expect(botModule).toHaveProperty('initBot');
    expect(botModule).toHaveProperty('sendTelegramMessage');
  });

  test('Send function existence: sendTelegramMessage is a callable function', () => {
    const { sendTelegramMessage } = require('../src/telegram/telegram.bot');
    expect(typeof sendTelegramMessage).toBe('function');
  });
});
