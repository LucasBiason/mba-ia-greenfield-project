import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import { ChannelsService } from '../channels/channels.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken];

describe('UsersService (integration)', () => {
  let dataSource: DataSource;
  let usersService: UsersService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    const channelsService = new ChannelsService(dataSource);
    usersService = new UsersService(userRepository, channelsService);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  describe('createUserWithChannel', () => {
    it('creates a user and channel', async () => {
      const user = await usersService.createUserWithChannel(
        'test@example.com',
        'hashed',
      );

      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.channel).toBeDefined();
      expect(user.channel.nickname).toBe('test');
      expect(user.channel.name).toBe('test');

      const dbUser = await userRepository.findOneBy({ id: user.id });
      const dbChannel = await channelRepository.findOneBy({ user_id: user.id });
      expect(dbUser).not.toBeNull();
      expect(dbChannel).not.toBeNull();
    });

    it('derives nickname from email prefix', async () => {
      const user = await usersService.createUserWithChannel(
        'john.doe+tag@example.com',
        'hashed',
      );
      expect(user.channel.nickname).toBe('johndoetag');
    });

    it('handles nickname collision by appending a random suffix', async () => {
      await usersService.createUserWithChannel('test@example.com', 'hashed');
      const user2 = await usersService.createUserWithChannel(
        'test@other.com',
        'hashed',
      );

      expect(user2.channel.nickname).toMatch(/^test_[a-z0-9]{3}$/);
    });

    it('compensates by deleting the user when channel creation fails irrecoverably', async () => {
      const failingChannelsService = new ChannelsService(dataSource);
      jest
        .spyOn(failingChannelsService, 'createChannel')
        .mockRejectedValue(new Error('channel creation failed'));

      const compensatingService = new UsersService(
        userRepository,
        failingChannelsService,
      );

      await expect(
        compensatingService.createUserWithChannel('orphan@example.com', 'hash'),
      ).rejects.toThrow('channel creation failed');

      const count = await userRepository.count({
        where: { email: 'orphan@example.com' },
      });
      expect(count).toBe(0);
    });
  });

  describe('findByEmail', () => {
    it('returns null when user does not exist', async () => {
      const result = await usersService.findByEmail('nobody@example.com');
      expect(result).toBeNull();
    });

    it('returns the user with password selected', async () => {
      await userRepository.save(
        userRepository.create({
          email: 'user@example.com',
          password: 'secret_hash',
        }),
      );

      const result = await usersService.findByEmail('user@example.com');
      expect(result).not.toBeNull();
      expect(result!.email).toBe('user@example.com');
      expect(result!.password).toBe('secret_hash');
    });

    it('returns null for a different email', async () => {
      await userRepository.save(
        userRepository.create({ email: 'user@example.com', password: 'hash' }),
      );

      const result = await usersService.findByEmail('other@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findByIdWithChannel', () => {
    it('returns the user with their channel relation loaded', async () => {
      const user = await usersService.createUserWithChannel(
        'profile@example.com',
        'hashed',
      );

      const found = await usersService.findByIdWithChannel(user.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(user.id);
      expect(found!.channel).toBeDefined();
      expect(found!.channel.nickname).toBe('profile');
    });

    it('returns null when user id is unknown', async () => {
      const found = await usersService.findByIdWithChannel(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByEmailWithChannel', () => {
    it('returns user with channel by email', async () => {
      const user = await usersService.createUserWithChannel(
        'byemail@example.com',
        'hashed',
      );

      const found = await usersService.findByEmailWithChannel(
        'byemail@example.com',
      );
      expect(found).not.toBeNull();
      expect(found!.id).toBe(user.id);
      expect(found!.email).toBe('byemail@example.com');
      expect(found!.channel).toBeDefined();
    });
  });
});
