import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseStorageService } from './supabase-storage.service';
import { ConfigService } from '@nestjs/config';
import { HttpException, BadRequestException } from '@nestjs/common';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(),
        remove: jest.fn(),
        getPublicUrl: jest.fn(),
      })),
    },
  })),
}));

describe('SupabaseStorageService', () => {
  let service: SupabaseStorageService;
  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    mockConfigService.get.mockImplementation((key) => {
      if (key === 'SUPABASE_URL') return 'http://test';
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-key';
      if (key === 'SUPABASE_STORAGE_BUCKET') return 'bucket';
      return null;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [SupabaseStorageService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<SupabaseStorageService>(SupabaseStorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getClient', () => {
    it('should throw if config missing', () => {
      mockConfigService.get.mockReturnValue(null);
      // @ts-ignore
      service.supabase = null;
      expect(() => (service as any).getClient()).toThrow(HttpException);
    });

    it('should return client', () => {
      // @ts-ignore
      service.supabase = null;
      expect((service as any).getClient()).toBeDefined();
    });
  });

  describe('uploadProductImage', () => {
    const file = { mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('test') } as any;

    it('should throw if file missing', async () => {
      await expect(service.uploadProductImage('m1', 'p1', null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if size too large', async () => {
      const largeFile = { ...file, size: 10 * 1024 * 1024 };
      await expect(service.uploadProductImage('m1', 'p1', largeFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if invalid mime type', async () => {
      const invalidFile = { ...file, mimetype: 'application/json' };
      await expect(service.uploadProductImage('m1', 'p1', invalidFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should upload successfully', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ data: { path: 'path' }, error: null });
      const mockGetPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'http://url' } });

      const mockClient = {
        storage: {
          from: jest.fn().mockReturnValue({
            upload: mockUpload,
            getPublicUrl: mockGetPublicUrl,
          }),
        },
      };
      // @ts-ignore
      service.supabase = mockClient;

      const res = await service.uploadProductImage('m1', 'p1', file);
      expect(res.imageUrl).toBe('http://url');
    });

    it('should throw on upload error', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } });
      const mockClient = {
        storage: {
          from: jest.fn().mockReturnValue({
            upload: mockUpload,
          }),
        },
      };
      // @ts-ignore
      service.supabase = mockClient;

      await expect(service.uploadProductImage('m1', 'p1', file)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('uploadProfilePhoto', () => {
    const file = { mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('test') } as any;

    it('should throw if file missing', async () => {
      await expect(service.uploadProfilePhoto(1, null as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw if invalid mime type', async () => {
      const invalidFile = { ...file, mimetype: 'application/json' };
      await expect(service.uploadProfilePhoto(1, invalidFile)).rejects.toThrow(BadRequestException);
    });

    it('should throw if size too large', async () => {
      const largeFile = { ...file, size: 10 * 1024 * 1024 };
      await expect(service.uploadProfilePhoto(1, largeFile)).rejects.toThrow(BadRequestException);
    });

    it('should upload successfully', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ data: { path: 'path' }, error: null });
      const mockGetPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'http://url' } });

      const mockClient = {
        storage: {
          from: jest.fn().mockReturnValue({
            upload: mockUpload,
            getPublicUrl: mockGetPublicUrl,
          }),
        },
      };
      // @ts-ignore
      service.supabase = mockClient;

      const res = await service.uploadProfilePhoto(1, file);
      expect(res.imageUrl).toBe('http://url');
    });

    it('should throw on upload error', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } });
      const mockClient = {
        storage: {
          from: jest.fn().mockReturnValue({
            upload: mockUpload,
          }),
        },
      };
      // @ts-ignore
      service.supabase = mockClient;

      await expect(service.uploadProfilePhoto(1, file)).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteProductImage', () => {
    it('should do nothing if invalid url', async () => {
      await expect(service.deleteProductImage('invalid')).resolves.not.toThrow();
    });

    it('should do nothing if falsy url', async () => {
      await expect(service.deleteProductImage('')).resolves.not.toThrow();
    });

    it('should delete successfully', async () => {
      const mockRemove = jest.fn().mockResolvedValue({ error: null });
      const mockClient = {
        storage: {
          from: jest.fn().mockReturnValue({
            remove: mockRemove,
          }),
        },
      };
      // @ts-ignore
      service.supabase = mockClient;

      await service.deleteProductImage('http://url/object/public/bucket/path.jpg');
      expect(mockRemove).toHaveBeenCalledWith(['path.jpg']);
    });

    it('should handle delete error', async () => {
      const mockRemove = jest.fn().mockResolvedValue({ error: { message: 'err' } });
      const mockClient = {
        storage: {
          from: jest.fn().mockReturnValue({
            remove: mockRemove,
          }),
        },
      };
      // @ts-ignore
      service.supabase = mockClient;

      await expect(
        service.deleteProductImage('http://url/object/public/bucket/path.jpg'),
      ).resolves.not.toThrow();
    });

    it('should catch client errors', async () => {
      const mockClient = {
        storage: null,
      };
      // @ts-ignore
      service.supabase = mockClient;

      await expect(
        service.deleteProductImage('http://url/object/public/bucket/path.jpg'),
      ).resolves.not.toThrow();
    });
  });
});
