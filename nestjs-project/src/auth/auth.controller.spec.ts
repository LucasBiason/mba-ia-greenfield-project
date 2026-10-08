import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { JwtPayload } from './auth.types';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(() => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      confirm: jest.fn(),
      resendConfirmation: jest.fn(),
      refresh: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      logout: jest.fn(),
      getUserProfile: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    controller = new AuthController(authService);
  });

  describe('register', () => {
    it('delegates to authService.register', async () => {
      authService.register.mockResolvedValue({
        id: 'u-1',
        email: 'test@example.com',
      });
      const result = await controller.register({
        email: 'test@example.com',
        password: 'Password123!',
      });
      expect(result).toEqual({ id: 'u-1', email: 'test@example.com' });
      expect(authService.register).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123!',
      });
    });
  });

  describe('login', () => {
    it('delegates to authService.login', async () => {
      authService.login.mockResolvedValue({
        access_token: 'at-1',
        refresh_token: 'rt-1',
      });
      const result = await controller.login({
        email: 'test@example.com',
        password: 'Password123!',
      });
      expect(result).toEqual({ access_token: 'at-1', refresh_token: 'rt-1' });
      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123!',
      });
    });
  });

  describe('confirmEmail', () => {
    it('delegates to authService.confirm', async () => {
      await controller.confirmEmail({ token: 'tok-123' });
      expect(authService.confirm).toHaveBeenCalledWith('tok-123');
    });
  });

  describe('resendConfirmation', () => {
    it('delegates to authService.resendConfirmation', async () => {
      await controller.resendConfirmation({ email: 'test@example.com' });
      expect(authService.resendConfirmation).toHaveBeenCalledWith(
        'test@example.com',
      );
    });
  });

  describe('refresh', () => {
    it('delegates to authService.refresh', async () => {
      authService.refresh.mockResolvedValue({
        access_token: 'new-at',
        refresh_token: 'new-rt',
      });
      const result = await controller.refresh({ refresh_token: 'rt-1' });
      expect(result).toEqual({
        access_token: 'new-at',
        refresh_token: 'new-rt',
      });
      expect(authService.refresh).toHaveBeenCalledWith('rt-1');
    });
  });

  describe('forgotPassword', () => {
    it('delegates to authService.forgotPassword', async () => {
      await controller.forgotPassword({ email: 'test@example.com' });
      expect(authService.forgotPassword).toHaveBeenCalledWith(
        'test@example.com',
      );
    });
  });

  describe('resetPassword', () => {
    it('delegates to authService.resetPassword', async () => {
      await controller.resetPassword({
        token: 'tok-1',
        new_password: 'NewPassword123!',
      });
      expect(authService.resetPassword).toHaveBeenCalledWith(
        'tok-1',
        'NewPassword123!',
      );
    });
  });

  describe('logout', () => {
    it('delegates to authService.logout', async () => {
      const user: JwtPayload = { sub: 'u-1', email: 'test@example.com' };
      await controller.logout(user);
      expect(authService.logout).toHaveBeenCalledWith('u-1');
    });
  });

  describe('me', () => {
    it('delegates to authService.getUserProfile with user sub', async () => {
      authService.getUserProfile.mockResolvedValue({
        sub: 'u-1',
        email: 'test@example.com',
        channel_id: 'chan-1',
        channel_slug: 'test-channel',
      });
      const user: JwtPayload = { sub: 'u-1', email: 'test@example.com' };
      const result = await controller.me(user);
      expect(result).toEqual({
        sub: 'u-1',
        email: 'test@example.com',
        channel_id: 'chan-1',
        channel_slug: 'test-channel',
      });
      expect(authService.getUserProfile).toHaveBeenCalledWith('u-1');
    });
  });
});
