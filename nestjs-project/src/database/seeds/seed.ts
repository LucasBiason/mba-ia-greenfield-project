import * as argon2 from 'argon2';
import { AppDataSource } from '../data-source';
import { User } from '../../users/entities/user.entity';
import { Channel } from '../../channels/entities/channel.entity';

export const DEMO_USER_ID = 'bb69a667-a196-4790-b5cd-4091bdc7fd44';
export const DEMO_CHANNEL_ID = '0cde5b02-e836-4c1e-b6b4-bbe807f0cad9';
export const DEMO_EMAIL = 'demo@streamtube.com';
export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Password123!';

async function runSeed(): Promise<void> {
  await AppDataSource.initialize();
  console.log('Database connection initialized for seed');

  const userRepository = AppDataSource.getRepository(User);
  const channelRepository = AppDataSource.getRepository(Channel);

  let user = await userRepository.findOne({ where: { email: DEMO_EMAIL } });
  if (!user) {
    const hashedPassword = await argon2.hash(DEMO_PASSWORD);
    user = userRepository.create({
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      password: hashedPassword,
      is_confirmed: true,
    });
    user = await userRepository.save(user);
    console.log(`Created demo user: ${DEMO_EMAIL} (${user.id})`);
  } else {
    user.is_confirmed = true;
    user.password = await argon2.hash(DEMO_PASSWORD);
    await userRepository.save(user);
    console.log(`Updated demo user password and confirmation: ${DEMO_EMAIL}`);
  }

  let channel = await channelRepository.findOne({
    where: { user_id: user.id },
  });
  if (!channel) {
    channel = channelRepository.create({
      id: DEMO_CHANNEL_ID,
      name: 'demo',
      nickname: 'demo',
      user_id: user.id,
      description: 'Canal oficial de demonstração e estudos do StreamTube',
    });
    await channelRepository.save(channel);
    console.log(`Created demo channel: ${channel.nickname} (${channel.id})`);
  }

  await AppDataSource.destroy();
  console.log('Seed completed successfully');
}

runSeed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
